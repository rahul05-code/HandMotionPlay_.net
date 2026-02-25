using System.ComponentModel.DataAnnotations;

namespace HandMotionPlay_.net.Models
{
    public class GameStat
    {
        [Key]
        public int GameId { get; set; }

        public int TotalPlayers { get; set; }
        public int TotalSessions { get; set; }
        public long TotalScore { get; set; }
        public decimal AvgScore { get; set; }
        public int TodaySessions { get; set; }

        public GameModel Game { get; set; }
    }
}
