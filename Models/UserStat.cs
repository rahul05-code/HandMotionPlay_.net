using System.ComponentModel.DataAnnotations;

namespace HandMotionPlay_.net.Models
{
    public class UserStat
    {
        [Key]
        public Guid UserId { get; set; }

        public int TotalSessions { get; set; }
        public int TotalGamesPlayed { get; set; }
        public long TotalScore { get; set; }
        public decimal AvgAccuracy { get; set; }
        public long TotalTimeSeconds { get; set; }

        public UserModel User { get; set; }
    }
}
