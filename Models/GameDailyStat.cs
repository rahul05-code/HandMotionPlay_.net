namespace HandMotionPlay_.net.Models
{
    public class GameDailyStat
    {
        public int Id { get; set; }

        public int GameId { get; set; }
        public GameModel Game { get; set; }

        public DateTime StatDate { get; set; }

        public int TotalSessions { get; set; }
        public long TotalScore { get; set; }
        public decimal AvgScore { get; set; }
    }
}

