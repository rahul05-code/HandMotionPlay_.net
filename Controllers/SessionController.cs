using HandMotionPlay_.net.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using HandMotionPlay_.net.Models;
using System.Security.Claims;

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
        [Microsoft.AspNetCore.Authorization.Authorize]
        public async Task<IActionResult> AddSession([FromBody] SessionModel model)
        {
            var userIdStr = User.FindFirstValue(System.Security.Claims.ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdStr, out Guid userId)) return Unauthorized();

            model.Id = Guid.NewGuid();
            model.UserId = userId; // Securely assign
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
