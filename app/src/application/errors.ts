export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`ジョブが見つかりません: ${jobId}`);
    this.name = 'JobNotFoundError';
  }
}

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}
