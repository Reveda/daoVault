import { usersRepository } from "./users.repository.js";

export class UsersService {
  async getPublicProfile(walletAddress: string) {
    const user = await usersRepository.findPublicByWallet(walletAddress.toLowerCase());
    if (!user) {
      const error = new Error("User not found") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    return user;
  }
}

export const usersService = new UsersService();
