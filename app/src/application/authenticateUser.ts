import type { AuthenticatedUser } from '../domain/user';
import { WorkspaceNotAllowedError } from './errors';
import type { AuthorizationResponse, IdentityProvider } from './ports/identityProvider';

/** 認可コードから利用者を認証し、許可されたワークスペースの利用者だけを通す */
export class AuthenticateUser {
  constructor(
    private readonly identityProvider: IdentityProvider,
    private readonly allowedTeamId: string,
  ) {}

  async execute(response: AuthorizationResponse): Promise<AuthenticatedUser> {
    const user = await this.identityProvider.authenticate(response);
    if (user.teamId !== this.allowedTeamId) {
      throw new WorkspaceNotAllowedError(user.teamId);
    }
    return user;
  }
}
