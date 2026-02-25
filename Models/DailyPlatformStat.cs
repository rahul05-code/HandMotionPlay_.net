namespace HandMotionPlay_.net.Models
{
    public class DailyPlatformStat
    {
        public int Id { get; set; }

        public DateTime StatDate { get; set; }

        public int TotalUsers { get; set; }
        public int ActiveUsers { get; set; }
        public int TotalSessions { get; set; }
        public long TotalScore { get; set; }
        public decimal AvgSessionTime { get; set; }
        public decimal AvgAccuracy { get; set; }
    }
}
