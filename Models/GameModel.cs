namespace HandMotionPlay_.net.Models
{
    public class GameModel
    {
        public int Id { get; set; }

        public string Name { get; set; }
        public string Description { get; set; }
        public string Difficulty { get; set; }

        public bool IsActive { get; set; } = true;

        public GameStat GameStat { get; set; }
        public ICollection<SessionModel> Sessions { get; set; }
    }
}
