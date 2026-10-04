/** 外部の ID プロバイダで認証された利用者 */
export interface AuthenticatedUser {
  id: string;
  /** 所属するワークスペースの ID */
  teamId: string;
  name: string;
}
