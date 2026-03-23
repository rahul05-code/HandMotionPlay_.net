using HandMotionPlay_.net.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HandMotionPlay_.net.Controllers
{
    public class AnalyticsController : Controller
    {
        private readonly AppDbContext _context;

        public AnalyticsController(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IActionResult> Index()
        {
            var last7Days = DateTime.UtcNow.AddDays(-7);

            var sessionGroups = await _context.Sessions
                .Where(x => x.SessionDate >= last7Days)
                .GroupBy(x => x.SessionDate.Date)
                .Select(g => new
                {
                    Date = g.Key,
                    Count = g.Count()
                })
                .OrderBy(x => x.Date)
                .ToListAsync();

            var sessionData = sessionGroups.Select(x => new
            {
                Date = x.Date.ToString("yyyy-MM-dd"),
                Count = x.Count
            }).ToList();

            var accuracyGroups = await _context.Sessions
                .GroupBy(x => x.SessionDate.Date)
                .Select(g => new
                {
                    Date = g.Key,
                    AvgAccuracy = g.Average(x => x.Accuracy)
                })
                .OrderBy(x => x.Date)
                .ToListAsync();

            var accuracyData = accuracyGroups.Select(x => new
            {
                Date = x.Date.ToString("yyyy-MM-dd"),
                AvgAccuracy = Math.Round((decimal)x.AvgAccuracy, 2)
            }).ToList();

            ViewBag.SessionData = sessionData;
            ViewBag.AccuracyData = accuracyData;

            return View();
        }
    }
}
