//
//  ShareViewController.swift
//  ShareExtension
//
//  Extensión de compartir de SubirFactura.
//
//  Autónoma a propósito: receive_sharing_intent 1.9.0 se distribuye SOLO por
//  Swift Package Manager, y añadir su paquete al target de la extensión choca
//  con el que Flutter ya referencia (paquete duplicado → "Package Resolution
//  Failed"). Como `RSIShareViewController` NO depende de Flutter (solo UIKit /
//  Photos), incrustamos aquí lo mínimo que necesita la extensión. El lado de la
//  app sigue usando el plugin normal; ambos se comunican por el App Group y el
//  esquema de URL, usando exactamente las mismas claves/constantes de abajo.
//
//  Fuente: receive_sharing_intent 1.9.0 (RSIShareViewController.swift,
//  RSIComposeView.swift y los modelos de ReceiveSharingIntentPlugin.swift).
//

import UIKit
import MobileCoreServices
import Photos
import AVFoundation
import UniformTypeIdentifiers

// MARK: - Constantes compartidas con el plugin (mismas claves que la app)

let kSchemePrefix = "ShareMedia"
let kUserDefaultsKey = "ShareKey"
let kUserDefaultsMessageKey = "ShareMessageKey"
let kAppGroupIdKey = "AppGroupId"

// MARK: - Modelos (idénticos a los del plugin)

public class SharedMediaFile: Codable {
    var path: String
    var mimeType: String?
    var thumbnail: String? // video thumbnail
    var duration: Double? // video duration in milliseconds
    var message: String? // post message
    var type: SharedMediaType

    public init(
        path: String,
        mimeType: String? = nil,
        thumbnail: String? = nil,
        duration: Double? = nil,
        message: String? = nil,
        type: SharedMediaType) {
            self.path = path
            self.mimeType = mimeType
            self.thumbnail = thumbnail
            self.duration = duration
            self.message = message
            self.type = type
        }
}

public enum SharedMediaType: String, Codable, CaseIterable {
    case image
    case video
    case text
    case file
    case url

    public var toUTTypeIdentifier: String {
        if #available(iOS 14.0, *) {
            switch self {
            case .image:
                return UTType.image.identifier
            case .video:
                return UTType.movie.identifier
            case .text:
                return UTType.text.identifier
            case .file:
                return UTType.fileURL.identifier
            case .url:
                return UTType.url.identifier
            }
        }
        switch self {
        case .image:
            return "public.image"
        case .video:
            return "public.movie"
        case .text:
            return "public.text"
        case .file:
            return "public.file-url"
        case .url:
            return "public.url"
        }
    }
}

// MARK: - Compose UI (solo se usa si shouldAutoRedirect() == false)

public protocol RSIComposeViewDelegate: AnyObject {
    func composeViewDidSelectPost(_ composeView: RSIComposeView)
    func composeViewDidSelectCancel(_ composeView: RSIComposeView)
    func composeViewDidChangeText(_ composeView: RSIComposeView)
}

open class RSIComposeView: UIView, UITextViewDelegate {

    public struct Configuration {
        public var placeholder: String
        public var sendButtonTitle: String

        public init(placeholder: String, sendButtonTitle: String) {
            self.placeholder = placeholder
            self.sendButtonTitle = sendButtonTitle
        }
    }

    public weak var delegate: RSIComposeViewDelegate?

    private let configuration: Configuration

    private let grabberView = UIView()
    private let closeButton = UIButton(type: .system)
    private let sendButton = UIButton(type: .system)
    private let textView = UITextView()
    private let placeholderLabel = UILabel()
    private let previewImageView = UIImageView()

    public var text: String { return textView.text ?? "" }

    public init(configuration: Configuration) {
        self.configuration = configuration
        super.init(frame: .zero)
        setupViews()
    }

    @available(*, unavailable)
    public required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public func setPreviewImage(_ image: UIImage?) {
        previewImageView.image = image
        previewImageView.isHidden = (image == nil)
    }

    public func setSendEnabled(_ enabled: Bool) {
        sendButton.isEnabled = enabled
        sendButton.backgroundColor = enabled ? .systemBlue : .systemGray3
    }

    @discardableResult
    public func focusTextView() -> Bool {
        return textView.becomeFirstResponder()
    }

    private func setupViews() {
        backgroundColor = .systemBackground
        layer.cornerRadius = 20
        layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        layer.masksToBounds = true

        grabberView.backgroundColor = .systemGray4
        grabberView.layer.cornerRadius = 2.5
        grabberView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(grabberView)

        let symbolConfig = UIImage.SymbolConfiguration(pointSize: 12, weight: .bold)
        closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: symbolConfig), for: .normal)
        closeButton.tintColor = .secondaryLabel
        closeButton.backgroundColor = .secondarySystemFill
        closeButton.layer.cornerRadius = 15
        closeButton.addTarget(self, action: #selector(onCancelTapped), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        addSubview(closeButton)

        sendButton.setTitle(configuration.sendButtonTitle, for: .normal)
        sendButton.setTitleColor(.white, for: .normal)
        sendButton.setTitleColor(UIColor.white.withAlphaComponent(0.6), for: .disabled)
        sendButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .bold)
        sendButton.backgroundColor = .systemBlue
        sendButton.layer.cornerRadius = 18
        sendButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 20, bottom: 8, right: 20)
        sendButton.addTarget(self, action: #selector(onSendTapped), for: .touchUpInside)
        sendButton.translatesAutoresizingMaskIntoConstraints = false
        addSubview(sendButton)

        textView.font = .systemFont(ofSize: 18)
        textView.backgroundColor = .clear
        textView.delegate = self
        textView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(textView)

        placeholderLabel.text = configuration.placeholder
        placeholderLabel.font = .systemFont(ofSize: 17)
        placeholderLabel.textColor = .placeholderText
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(placeholderLabel)

        previewImageView.contentMode = .scaleAspectFill
        previewImageView.clipsToBounds = true
        previewImageView.layer.cornerRadius = 12
        previewImageView.layer.borderWidth = 1
        previewImageView.layer.borderColor = UIColor.systemGray6.cgColor
        previewImageView.isHidden = true
        previewImageView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(previewImageView)

        let guide = safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            grabberView.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            grabberView.centerXAnchor.constraint(equalTo: centerXAnchor),
            grabberView.widthAnchor.constraint(equalToConstant: 36),
            grabberView.heightAnchor.constraint(equalToConstant: 5),

            closeButton.topAnchor.constraint(equalTo: grabberView.bottomAnchor, constant: 12),
            closeButton.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 20),
            closeButton.widthAnchor.constraint(equalToConstant: 30),
            closeButton.heightAnchor.constraint(equalToConstant: 30),

            sendButton.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            sendButton.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -20),
            sendButton.leadingAnchor.constraint(greaterThanOrEqualTo: closeButton.trailingAnchor, constant: 12),

            textView.topAnchor.constraint(equalTo: closeButton.bottomAnchor, constant: 16),
            textView.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            textView.heightAnchor.constraint(greaterThanOrEqualToConstant: 100),
            textView.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -20),

            placeholderLabel.topAnchor.constraint(equalTo: textView.topAnchor, constant: 8),
            placeholderLabel.leadingAnchor.constraint(equalTo: textView.leadingAnchor, constant: 5),

            previewImageView.topAnchor.constraint(equalTo: textView.topAnchor, constant: 4),
            previewImageView.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -20),
            previewImageView.leadingAnchor.constraint(equalTo: textView.trailingAnchor, constant: 12),
            previewImageView.widthAnchor.constraint(equalToConstant: 72),
            previewImageView.heightAnchor.constraint(equalToConstant: 72),
        ])
    }

    @objc private func onSendTapped() {
        delegate?.composeViewDidSelectPost(self)
    }

    @objc private func onCancelTapped() {
        delegate?.composeViewDidSelectCancel(self)
    }

    open func textViewDidChange(_ textView: UITextView) {
        placeholderLabel.isHidden = !textView.text.isEmpty
        delegate?.composeViewDidChangeText(self)
    }
}

// MARK: - Controlador base (equivalente a RSIShareViewController del plugin)

open class RSIShareViewController: UIViewController, RSIComposeViewDelegate {
    var hostAppBundleIdentifier = ""
    var appGroupId = ""
    var sharedMedia: [SharedMediaFile] = []

    open func shouldAutoRedirect() -> Bool {
        return true
    }

    open var placeholder: String { return "Add a message…" }
    open var sendButtonTitle: String { return "Send" }
    open var preferredSheetHeight: CGFloat { return 200 }
    open var contentText: String { return composeView?.text ?? "" }
    open func isContentValid() -> Bool { return true }

    open func didSelectPost() {
        saveAndRedirect(message: contentText)
    }

    open func didSelectCancel() {
        cancel()
    }

    private var composeView: RSIComposeView?
    private var pendingPreviewImage: UIImage?

    open override func viewDidLoad() {
        super.viewDidLoad()
        loadIds()
        if !shouldAutoRedirect() {
            setupComposeUI()
        }
    }

    open override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if shouldAutoRedirect() {
            view.backgroundColor = .clear
            var ancestor = view.superview
            while let current = ancestor {
                current.backgroundColor = .clear
                current.isOpaque = false
                ancestor = current.superview
            }
        }
    }

    open override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)

        if !shouldAutoRedirect() {
            composeView?.focusTextView()
        }

        if let content = extensionContext!.inputItems[0] as? NSExtensionItem {
            if let contents = content.attachments {
                for (index, attachment) in (contents).enumerated() {
                    for type in SharedMediaType.allCases {
                        if attachment.hasItemConformingToTypeIdentifier(type.toUTTypeIdentifier) {
                            attachment.loadItem(forTypeIdentifier: type.toUTTypeIdentifier) { [weak self] data, error in
                                guard let this = self, error == nil else {
                                    self?.dismissWithError()
                                    return
                                }
                                switch type {
                                case .text:
                                    if let text = data as? String {
                                        this.handleMedia(forLiteral: text, type: type, index: index, content: content)
                                    }
                                case .url:
                                    if let url = data as? URL {
                                        this.handleMedia(forLiteral: url.absoluteString, type: type, index: index, content: content)
                                    }
                                default:
                                    if let url = data as? URL {
                                        this.handleMedia(forFile: url, type: type, index: index, content: content)
                                    } else if let image = data as? UIImage {
                                        this.handleMedia(forUIImage: image, type: type, index: index, content: content)
                                    }
                                }
                            }
                            break
                        }
                    }
                }
            }
        }
    }

    private func loadIds() {
        let shareExtensionAppBundleIdentifier = Bundle.main.bundleIdentifier!
        let lastIndexOfPoint = shareExtensionAppBundleIdentifier.lastIndex(of: ".")
        hostAppBundleIdentifier = String(shareExtensionAppBundleIdentifier[..<lastIndexOfPoint!])
        let defaultAppGroupId = "group.\(hostAppBundleIdentifier)"
        let customAppGroupId = Bundle.main.object(forInfoDictionaryKey: kAppGroupIdKey) as? String
        appGroupId = customAppGroupId ?? defaultAppGroupId
    }

    private func handleMedia(forLiteral item: String, type: SharedMediaType, index: Int, content: NSExtensionItem) {
        sharedMedia.append(SharedMediaFile(
            path: item,
            mimeType: type == .text ? "text/plain" : nil,
            type: type
        ))
        completeAttachment(index: index, content: content)
    }

    private func handleMedia(forUIImage image: UIImage, type: SharedMediaType, index: Int, content: NSExtensionItem) {
        let tempPath = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)!.appendingPathComponent("TempImage.png")
        if self.writeTempFile(image, to: tempPath) {
            let newPathDecoded = tempPath.absoluteString.removingPercentEncoding!
            sharedMedia.append(SharedMediaFile(
                path: newPathDecoded,
                mimeType: type == .image ? "image/png" : nil,
                type: type
            ))
        }
        if pendingPreviewImage == nil { pendingPreviewImage = image }
        completeAttachment(index: index, content: content)
    }

    private func handleMedia(forFile url: URL, type: SharedMediaType, index: Int, content: NSExtensionItem) {
        let fileName = getFileName(from: url, type: type)
        let newPath = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)!.appendingPathComponent(fileName)

        if copyFile(at: url, to: newPath) {
            let newPathDecoded = newPath.absoluteString.removingPercentEncoding!
            if type == .video {
                if let videoInfo = getVideoInfo(from: url) {
                    let thumbnailPathDecoded = videoInfo.thumbnail?.removingPercentEncoding
                    sharedMedia.append(SharedMediaFile(
                        path: newPathDecoded,
                        mimeType: url.mimeType(),
                        thumbnail: thumbnailPathDecoded,
                        duration: videoInfo.duration,
                        type: type
                    ))
                    if pendingPreviewImage == nil, let thumb = videoInfo.thumbnail,
                       let thumbURL = URL(string: thumb) {
                        pendingPreviewImage = UIImage(contentsOfFile: thumbURL.path)
                    }
                }
            } else {
                sharedMedia.append(SharedMediaFile(
                    path: newPathDecoded,
                    mimeType: url.mimeType(),
                    type: type
                ))
                if type == .image, pendingPreviewImage == nil {
                    pendingPreviewImage = UIImage(contentsOfFile: newPath.path)
                }
            }
        }

        completeAttachment(index: index, content: content)
    }

    private func completeAttachment(index: Int, content: NSExtensionItem) {
        guard index == (content.attachments?.count ?? 0) - 1 else { return }
        if shouldAutoRedirect() {
            saveAndRedirect()
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.didFinishLoadingContent()
            }
        }
    }

    private func setupComposeUI() {
        let configuration = RSIComposeView.Configuration(
            placeholder: placeholder,
            sendButtonTitle: sendButtonTitle
        )
        let composeView = RSIComposeView(configuration: configuration)
        composeView.delegate = self
        composeView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(composeView)
        NSLayoutConstraint.activate([
            composeView.topAnchor.constraint(equalTo: view.topAnchor),
            composeView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            composeView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            composeView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        self.composeView = composeView
        updateSendEnabled()
    }

    private func didFinishLoadingContent() {
        guard !shouldAutoRedirect() else { return }
        composeView?.setPreviewImage(pendingPreviewImage)
        updateSendEnabled()
    }

    private func updateSendEnabled() {
        guard let composeView = composeView else { return }
        composeView.setSendEnabled(isContentValid())
    }

    open func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: "RSIShareViewController", code: 0, userInfo: [NSLocalizedDescriptionKey: "User cancelled"]))
    }

    open func composeViewDidSelectPost(_ composeView: RSIComposeView) {
        didSelectPost()
    }

    open func composeViewDidSelectCancel(_ composeView: RSIComposeView) {
        didSelectCancel()
    }

    open func composeViewDidChangeText(_ composeView: RSIComposeView) {
        updateSendEnabled()
    }

    open func saveAndRedirect(message: String? = nil) {
        let userDefaults = UserDefaults(suiteName: appGroupId)
        userDefaults?.set(toData(data: sharedMedia), forKey: kUserDefaultsKey)
        userDefaults?.set(message, forKey: kUserDefaultsMessageKey)
        userDefaults?.synchronize()
        redirectToHostApp()
    }

    private func redirectToHostApp() {
        loadIds()
        let url = URL(string: "\(kSchemePrefix)-\(hostAppBundleIdentifier):share")
        var responder = self as UIResponder?

        if #available(iOS 18.0, *) {
            while responder != nil {
                if let application = responder as? UIApplication {
                    application.open(url!, options: [:], completionHandler: nil)
                }
                responder = responder?.next
            }
        } else {
            let selectorOpenURL = sel_registerName("openURL:")
            while (responder != nil) {
                if (responder?.responds(to: selectorOpenURL))! {
                    _ = responder?.perform(selectorOpenURL, with: url)
                }
                responder = responder!.next
            }
        }

        extensionContext!.completeRequest(returningItems: [], completionHandler: nil)
    }

    private func dismissWithError() {
        print("[ERROR] Error loading data!")
        let alert = UIAlertController(title: "Error", message: "Error loading data", preferredStyle: .alert)
        let action = UIAlertAction(title: "Error", style: .cancel) { _ in
            self.dismiss(animated: true, completion: nil)
        }
        alert.addAction(action)
        present(alert, animated: true, completion: nil)
        extensionContext!.completeRequest(returningItems: [], completionHandler: nil)
    }

    private func getFileName(from url: URL, type: SharedMediaType) -> String {
        var name = url.lastPathComponent
        if name.isEmpty {
            switch type {
            case .image:
                name = UUID().uuidString + ".png"
            case .video:
                name = UUID().uuidString + ".mp4"
            case .text:
                name = UUID().uuidString + ".txt"
            default:
                name = UUID().uuidString
            }
        }
        return name
    }

    private func writeTempFile(_ image: UIImage, to dstURL: URL) -> Bool {
        do {
            if FileManager.default.fileExists(atPath: dstURL.path) {
                try FileManager.default.removeItem(at: dstURL)
            }
            let pngData = image.pngData()
            try pngData?.write(to: dstURL)
            return true
        } catch (let error) {
            print("Cannot write to temp file: \(error)")
            return false
        }
    }

    private func copyFile(at srcURL: URL, to dstURL: URL) -> Bool {
        do {
            if FileManager.default.fileExists(atPath: dstURL.path) {
                try FileManager.default.removeItem(at: dstURL)
            }
            try FileManager.default.copyItem(at: srcURL, to: dstURL)
        } catch (let error) {
            print("Cannot copy item at \(srcURL) to \(dstURL): \(error)")
            return false
        }
        return true
    }

    private func getVideoInfo(from url: URL) -> (thumbnail: String?, duration: Double)? {
        let asset = AVAsset(url: url)
        let duration = (CMTimeGetSeconds(asset.duration) * 1000).rounded()
        let thumbnailPath = getThumbnailPath(for: url)

        if FileManager.default.fileExists(atPath: thumbnailPath.path) {
            return (thumbnail: thumbnailPath.absoluteString, duration: duration)
        }

        var saved = false
        let assetImgGenerate = AVAssetImageGenerator(asset: asset)
        assetImgGenerate.appliesPreferredTrackTransform = true
        assetImgGenerate.maximumSize = CGSize(width: 360, height: 360)
        do {
            let img = try assetImgGenerate.copyCGImage(at: CMTimeMakeWithSeconds(600, preferredTimescale: 1), actualTime: nil)
            try UIImage(cgImage: img).pngData()?.write(to: thumbnailPath)
            saved = true
        } catch {
            saved = false
        }

        return saved ? (thumbnail: thumbnailPath.absoluteString, duration: duration) : nil
    }

    private func getThumbnailPath(for url: URL) -> URL {
        let fileName = Data(url.lastPathComponent.utf8).base64EncodedString().replacingOccurrences(of: "==", with: "")
        let path = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)!
            .appendingPathComponent("\(fileName).jpg")
        return path
    }

    private func toData(data: [SharedMediaFile]) -> Data {
        let encodedData = try? JSONEncoder().encode(data)
        return encodedData!
    }
}

extension URL {
    public func mimeType() -> String {
        if #available(iOS 14.0, *) {
            if let mimeType = UTType(filenameExtension: self.pathExtension)?.preferredMIMEType {
                return mimeType
            }
        } else {
            if let uti = UTTypeCreatePreferredIdentifierForTag(kUTTagClassFilenameExtension, self.pathExtension as NSString, nil)?.takeRetainedValue() {
                if let mimetype = UTTypeCopyPreferredTagWithClass(uti, kUTTagClassMIMEType)?.takeRetainedValue() {
                    return mimetype as String
                }
            }
        }
        return "application/octet-stream"
    }
}

// MARK: - Nuestra subclase concreta (la que instancia el storyboard)

class ShareViewController: RSIShareViewController {

    override func shouldAutoRedirect() -> Bool {
        return true
    }
}
