import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function normalizeCnpj(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function normalizeCnpjRegistration(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    : '';
}

function cnpjCharacterValue(character: string): number {
  return character.charCodeAt(0) - 48;
}

function calculateCnpjCheckDigit(value: string, weights: number[]): number {
  const sum = weights.reduce(
    (total, weight, index) =>
      total + cnpjCharacterValue(value[index] ?? '0') * weight,
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: unknown): boolean {
  const cnpj = normalizeCnpjRegistration(value);

  if (cnpj.length !== 14) return false;
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
  if (/^([A-Z0-9])\1{13}$/.test(cnpj)) return false;

  const firstDigit = calculateCnpjCheckDigit(
    cnpj,
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const secondDigit = calculateCnpjCheckDigit(
    `${cnpj.slice(0, 12)}${firstDigit}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );

  return Number(cnpj[12]) === firstDigit && Number(cnpj[13]) === secondDigit;
}

export function IsCnpj(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isCnpj',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isValidCnpj(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} deve ser um CNPJ válido com 14 posições, aceitando o formato alfanumérico oficial.`;
        },
      },
    });
  };
}
