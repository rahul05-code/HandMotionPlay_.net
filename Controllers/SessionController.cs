using HandMotionPlay_.net.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using HandMotionPlay_.net.Models;

namespace HandMotionPlay_.net.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SessionController : ControllerBase
    {
        private readonly AppDbContext _context;

        public SessionController(AppDbContext context)
        {
            _context = context;
        }

        [HttpPost("add")]
        public async Task<IActionResult> AddSession([FromBody] SessionModel model)
        {
            model.Id = Guid.NewGuid();
            model.SessionDate = DateTime.UtcNow;

            _context.Sessions.Add(model);
            await _context.SaveChangesAsync();

            // ✅ Update UserStats
            var userStat = await _context.UserStats
                .FirstOrDefaultAsync(x => x.UserId == model.UserId);

            if (userStat != null)
            {
                userStat.TotalSessions += 1;
                userStat.TotalScore += model.Score;
                userStat.TotalTimeSeconds += model.DurationSeconds;

                await _context.SaveChangesAsync();
            }

            return Ok(new { message = "Session added successfully" });
        }
    }
}
