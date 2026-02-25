using HandMotionPlay_.net.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HandMotionPlay_.net.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AnalyticsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AnalyticsController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet("weekly-sessions")]
        public async Task<IActionResult> GetWeeklySessions()
        {
            var last7Days = DateTime.UtcNow.AddDays(-7);

            var data = await _context.Sessions
                .Where(x => x.SessionDate >= last7Days)
                .GroupBy(x => x.SessionDate.Date)
                .Select(g => new
                {
                    date = g.Key,
                    count = g.Count()
                })
                .OrderBy(x => x.date)
                .ToListAsync();

            return Ok(data);
        }

        [HttpGet("accuracy-trend")]
        public async Task<IActionResult> GetAccuracyTrend()
        {
            var data = await _context.Sessions
                .GroupBy(x => x.SessionDate.Date)
                .Select(g => new
                {
                    date = g.Key,
                    avgAccuracy = g.Average(x => x.Accuracy)
                })
                .OrderBy(x => x.date)
                .ToListAsync();

            return Ok(data);
        }
    }
}
