namespace HandMotionPlay_.net.Models
{
    public class UserModel
    {
        public Guid Id { get; set; }

        public string Name { get; set; }
        public string Email { get; set; }
        public string Password { get; set; }

        public string Status { get; set; } = "active";
        public string Role { get; set; } = "user";

        public DateTime? LastLogin { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public UserStat UserStat { get; set; }
        public ICollection<SessionModel> Sessions { get; set; }
    }
}
