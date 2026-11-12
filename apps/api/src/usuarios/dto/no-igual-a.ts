import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/** La propiedad no puede ser igual (sin importar mayúsculas) a otra propiedad del mismo objeto. */
export function NoIgualA(otra: string, opciones?: ValidationOptions) {
  return (objeto: object, propiedad: string): void => {
    registerDecorator({
      name: 'noIgualA',
      target: objeto.constructor,
      propertyName: propiedad,
      constraints: [otra],
      options: opciones,
      validator: {
        validate(valor: unknown, args: ValidationArguments): boolean {
          const otro = (args.object as Record<string, unknown>)[args.constraints[0] as string];
          return !(
            typeof valor === 'string' &&
            typeof otro === 'string' &&
            valor.toLowerCase() === otro.toLowerCase()
          );
        },
      },
    });
  };
}
