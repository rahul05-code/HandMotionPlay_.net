using HandMotionPlay_.net.Models;
using Microsoft.EntityFrameworkCore;

namespace HandMotionPlay_.net.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
        {
        }

        public DbSet<UserModel> Users { get; set; }
        public DbSet<GameModel> Games { get; set; }
        public DbSet<SessionModel> Sessions { get; set; }
        public DbSet<UserStat> UserStats { get; set; }
        public DbSet<GameStat> GameStats { get; set; }
        public DbSet<DailyPlatformStat> DailyPlatformStats { get; set; }
        public DbSet<GameDailyStat> GameDailyStats { get; set; }
        public DbSet<PlatformStatus> PlatformStatuses { get; set; }

    }
}
