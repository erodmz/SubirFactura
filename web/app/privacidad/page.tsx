import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '../../components/Logo';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Cómo SubirFactura recolecta, usa y protege los datos de contadores y contribuyentes en República Dominicana.',
};

const ACTUALIZADO = '23 de julio de 2026';

export default function PrivacidadPage() {
  return (
    <main className="legal-page">
      <header className="legal-head">
        <Link href="/" aria-label="Inicio">
          <Logo size={28} />
        </Link>
        <h1>Política de privacidad</h1>
        <p className="legal-meta">Última actualización: {ACTUALIZADO}</p>
      </header>

      <section className="legal-body">
        <p>
          SubirFactura (&laquo;la Plataforma&raquo;) ayuda a contadores de República
          Dominicana a recolectar y digitalizar las facturas de gastos de sus clientes
          y a generar el Formato 606 de la DGII. Esta política explica qué datos
          tratamos, con qué fin y qué derechos tienes. Al usar la Plataforma aceptas
          lo aquí descrito.
        </p>

        <h2>1. Quién es responsable</h2>
        <p>
          El responsable de la Plataforma es el equipo de SubirFactura. Para cualquier
          asunto de privacidad puedes escribir a{' '}
          <a href="mailto:privacidad@subirfactura.com">privacidad@subirfactura.com</a>.
        </p>
        <p>
          Cuando un despacho de contadores usa la Plataforma para tratar datos de sus
          propios clientes (contribuyentes), el despacho actúa como responsable de esos
          datos y SubirFactura los trata por su cuenta y bajo sus instrucciones.
        </p>

        <h2>2. Qué datos recolectamos</h2>
        <ul>
          <li>
            <strong>De tu cuenta:</strong> nombre, correo electrónico y, opcionalmente,
            teléfono. Sirven para identificarte, iniciar sesión y comunicarnos contigo.
          </li>
          <li>
            <strong>De las facturas:</strong> las fotos de los comprobantes y los datos
            que contienen (RNC, NCF, fecha, montos, ITBIS, proveedor). Son el objeto del
            servicio: se digitalizan para armar el 606.
          </li>
          <li>
            <strong>De tu empresa:</strong> razón social, RNC y, si lo subes, el
            documento de verificación de titularidad y el logo.
          </li>
          <li>
            <strong>Técnicos:</strong> registros de acceso (fecha, IP y acción) que
            usamos para seguridad y para auditar el propio servicio.
          </li>
        </ul>
        <p>
          No recolectamos datos para publicidad ni construimos perfiles con fines
          comerciales.
        </p>

        <h2>3. Para qué los usamos</h2>
        <ul>
          <li>Prestar el servicio: digitalizar facturas y generar el 606.</li>
          <li>Verificar la titularidad de la empresa (KYC) antes de activarla.</li>
          <li>Enviarte correos de la cuenta: verificación, recuperación e invitaciones.</li>
          <li>Mantener la seguridad y prevenir abusos.</li>
          <li>Cumplir obligaciones legales y fiscales.</li>
        </ul>

        <h2>4. Con quién se comparten</h2>
        <p>
          No vendemos tus datos. Solo los compartimos con proveedores que hacen posible
          el servicio, y únicamente para eso:
        </p>
        <ul>
          <li>
            <strong>Proveedor de IA (Anthropic):</strong> la imagen de la factura se
            envía para extraer sus datos. No se usa para entrenar modelos.
          </li>
          <li>
            <strong>Proveedor de correo:</strong> para enviarte los correos de la cuenta.
          </li>
          <li>
            <strong>DGII:</strong> consultamos el padrón y la validez de RNC/NCF para
            verificar los datos; el 606 lo presentas tú ante la DGII.
          </li>
          <li>
            <strong>Autoridades:</strong> cuando la ley lo exija mediante requerimiento
            válido.
          </li>
        </ul>

        <h2>5. Dónde se guardan y por cuánto tiempo</h2>
        <p>
          Los datos se alojan en servidores cifrados. Las imágenes de las facturas se
          sirven solo a través del propio servicio, nunca de forma pública. Conservamos
          los datos mientras tu cuenta esté activa y el tiempo que exijan las
          obligaciones fiscales; luego los eliminamos o anonimizamos.
        </p>

        <h2>6. Seguridad</h2>
        <p>
          Ciframos las comunicaciones (HTTPS), aislamos los datos de cada despacho,
          limitamos el acceso por rol y respaldamos la información de forma cifrada.
          Ningún sistema es infalible, pero trabajamos para protegerla.
        </p>

        <h2>7. Tus derechos</h2>
        <p>
          Puedes solicitar acceder, corregir o eliminar tus datos personales, y oponerte
          a ciertos tratamientos, escribiendo a{' '}
          <a href="mailto:privacidad@subirfactura.com">privacidad@subirfactura.com</a>.
          Atenderemos tu solicitud conforme a la normativa dominicana aplicable
          (Ley 172-13 de protección de datos personales).
        </p>

        <h2>8. Menores</h2>
        <p>
          La Plataforma es para uso profesional y no está dirigida a menores de edad.
        </p>

        <h2>9. Cambios</h2>
        <p>
          Podemos actualizar esta política. Publicaremos la versión vigente aquí con su
          fecha; los cambios relevantes se te comunicarán por la Plataforma o por correo.
        </p>

        <p className="legal-nota">
          Este documento describe nuestras prácticas de forma general y no sustituye
          asesoría legal.
        </p>
      </section>

      <footer className="legal-foot">
        <Link href="/">← Volver al inicio</Link>
        <Link href="/terminos">Términos de servicio</Link>
      </footer>
    </main>
  );
}
