/** ドメインの不変条件に違反したときのエラー */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
