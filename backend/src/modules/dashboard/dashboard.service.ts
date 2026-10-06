import { dashboardRepository } from "./dashboard.repository.js";

export class DashboardService {
  async getDashboard(walletAddress: string) {
    const user = await dashboardRepository.findUserDashboard(walletAddress.toLowerCase());
    if (!user) {
      const error = new Error("User not found") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    const earnings = await dashboardRepository.sumEarnings(user.id);
    return {
      walletAddress: user.walletAddress,
      referralCode: user.referralCode,
      activeDirects: user.activeDirectsCount,
      currentRank: user.currentRank,
      totalEarned: earnings._sum.amountUsd ?? 0,
      packages: user.packages,
    };
  }
}

export const dashboardService = new DashboardService();
