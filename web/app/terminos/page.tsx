import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '../../components/Logo';

export const metadata: Metadata = {
  title: 'Términos de servicio',
  description: 'Condiciones de uso de la plataforma SubirFactura.',
};

const ACTUALIZADO = '23 de julio de 2026';

export default function TerminosPage() {
  return (
    <main className="legal-page">
      <header className="legal-head">
        <Link href="/" aria-label="Inicio">
          <Logo size={28} />
        </Link>
        <h1>Términos de servicio</h1>
        <p className="legal-meta">Última actualización: {ACTUALIZADO}</p>
      </header>

      <section className="legal-body">
        <p>
          Estos términos rigen el uso de SubirFactura (&laquo;la Plataforma&raquo;). Al
          crear una cuenta o usar el servicio, aceptas estas condiciones.
        </p>

        <h2>1. El servicio</h2>
        <p>
          SubirFactura permite a contadores recolectar y digitalizar facturas de gastos
          de sus clientes y generar el Formato 606 de la DGII. La digitalización asistida
          por IA es una ayuda: el contador es responsable de revisar y validar los datos
          antes de reportarlos.
        </p>

        <h2>2. Tu cuenta</h2>
        <ul>
          <li>Eres responsable de la exactitud de los datos que registras.</li>
          <li>Debes cuidar tus credenciales y no compartirlas.</li>
          <li>
            Las empresas nuevas pasan por una verificación de titularidad antes de
            activarse.
          </li>
        </ul>

        <h2>3. Planes y pagos</h2>
        <p>
          Los planes y sus límites se muestran en la Plataforma. El cobro de los planes
          de pago se coordina de forma manual; un plan de pago se activa una vez
          confirmado el pago. Puedes cambiar o cancelar tu plan según lo que indique la
          Plataforma.
        </p>

        <h2>4. Uso aceptable</h2>
        <p>
          No puedes usar la Plataforma para fines ilícitos, subir contenido que no te
          pertenezca o al que no tengas acceso, ni intentar vulnerar su seguridad.
        </p>

        <h2>5. Responsabilidad</h2>
        <p>
          La Plataforma se ofrece &laquo;tal cual&raquo;. No garantizamos que la
          extracción automática sea perfecta ni sustituimos el criterio profesional del
          contador. En la medida que permita la ley, no respondemos por daños indirectos
          derivados del uso del servicio.
        </p>

        <h2>6. Datos</h2>
        <p>
          El tratamiento de datos personales se rige por nuestra{' '}
          <Link href="/privacidad">Política de privacidad</Link>.
        </p>

        <h2>7. Cambios y terminación</h2>
        <p>
          Podemos actualizar estos términos o suspender cuentas que los incumplan.
          Publicaremos la versión vigente aquí con su fecha.
        </p>

        <h2>8. Contacto</h2>
        <p>
          Para cualquier duda escribe a{' '}
          <a href="mailto:hola@subirfactura.com">hola@subirfactura.com</a>.
        </p>

        <p className="legal-nota">
          Este documento es de carácter general y no constituye asesoría legal.
        </p>
      </section>

      <footer className="legal-foot">
        <Link href="/">← Volver al inicio</Link>
        <Link href="/privacidad">Política de privacidad</Link>
      </footer>
    </main>
  );
}
