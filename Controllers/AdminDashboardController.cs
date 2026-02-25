using HandMotionPlay_.net.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HandMotionPlay_.net.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AdminDashboardController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AdminDashboardController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetDashboardSummary()
        {
            var totalUsers = await _context.Users.CountAsync();
            var totalSessions = await _context.Sessions.CountAsync();
            var totalScore = await _context.Sessions.SumAsync(x => (long?)x.Score) ?? 0;
            var avgAccuracy = await _context.Sessions.AverageAsync(x => (decimal?)x.Accuracy) ?? 0;

            return Ok(new
            {
                totalUsers,
                totalSessions,
                totalScore,
                avgAccuracy
            });
        }
    }
}
