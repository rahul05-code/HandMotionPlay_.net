namespace HandMotionPlay_.net.Models
{
    public class SessionModel
    {
        public Guid Id { get; set; }

        public Guid UserId { get; set; }
        public UserModel User { get; set; }

        public int GameId { get; set; }
        public GameModel Game { get; set; }

        public int Score { get; set; }
        public decimal Accuracy { get; set; }
        public int DurationSeconds { get; set; }

        public DateTime SessionDate { get; set; }
    }
}
