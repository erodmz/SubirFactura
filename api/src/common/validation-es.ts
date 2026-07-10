// Red de seguridad de i18n para la validación (T7 del plan post-pruebas):
// class-validator emite sus mensajes por defecto EN INGLÉS ("password should
// not be empty" se coló hasta el login del móvil). La primera línea de defensa
// son mensajes en español en cada decorador; esto traduce lo que se escape.

const TRADUCCIONES: Array<[RegExp, string]> = [
  [/^(\w+) should not be empty$/, 'El campo $1 es obligatorio'],
  [/^(\w+) must be a string$/, 'El campo $1 debe ser texto'],
  [/^(\w+) must be an email$/, 'El campo $1 debe ser un correo válido'],
  [/^(\w+) must be a number.*$/, 'El campo $1 debe ser un número'],
  [/^(\w+) must be a boolean value$/, 'El campo $1 debe ser verdadero o falso'],
  [/^(\w+) must be longer than or equal to (\d+) characters$/, 'El campo $1 debe tener al menos $2 caracteres'],
  [/^(\w+) must be shorter than or equal to (\d+) characters$/, 'El campo $1 no puede pasar de $2 caracteres'],
  [/^(\w+) must not be less than (\d+)$/, 'El campo $1 no puede ser menor que $2'],
  [/^(\w+) must be one of the following values: (.+)$/, 'El campo $1 debe ser uno de: $2'],
  [/^property (\w+) should not exist$/, 'El campo $1 no está permitido'],
];

/** Nombres de campos técnicos → etiqueta que el usuario reconoce. */
const CAMPO_LEGIBLE: Record<string, string> = {
  password: 'contraseña',
  email: 'correo electrónico',
  nombre: 'nombre',
  refreshToken: 'sesión',
  currentPassword: 'contraseña actual',
  newPassword: 'contraseña nueva',
};

export function traducirMensajeValidacion(mensaje: string): string {
  for (const [patron, plantilla] of TRADUCCIONES) {
    const m = mensaje.match(patron);
    if (m) {
      let out = plantilla;
      for (let i = 1; i < m.length; i++) {
        const valor = i === 1 ? (CAMPO_LEGIBLE[m[i]!] ?? m[i]!) : m[i]!;
        out = out.replace(`$${i}`, valor);
      }
      return out;
    }
  }
  return mensaje; // ya venía en español (mensaje explícito del decorador)
}
