using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using HandMotionPlay_.net.Data;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace HandMotionPlay_.net.Controllers
{
    [Authorize]
    public class ProgressController : Controller
    {
        private readonly AppDbContext _context;

        public ProgressController(AppDbContext context)
        {
            _context = context;
        }

        public IActionResult Index()
        {
            return RedirectToAction("Progress");
        }

        public async Task<IActionResult> Progress()
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdStr, out Guid userId)) return RedirectToAction("Login", "Account");

            var sessions = await _context.Sessions
                .Include(s => s.Game)
                .Where(s => s.UserId == userId)
                .OrderByDescending(s => s.SessionDate)
                .ToListAsync();

            // Stats
            var totalSessions = sessions.Count;
            var totalTimeSeconds = sessions.Sum(s => s.DurationSeconds);
            var hours = totalTimeSeconds / 3600;
            var minutes = (totalTimeSeconds % 3600) / 60;
            var totalTimeFormatted = $"{hours}h {minutes}m";

            var avgAccuracy = sessions.Any() ? sessions.Average(s => s.Accuracy) : 0;
            var totalScore = sessions.Sum(s => s.Score);

            // Day Streak Calculation
            int streak = 0;
            var dates = sessions.Select(s => s.SessionDate.Date).Distinct().OrderByDescending(d => d).ToList();
            var checkDate = DateTime.UtcNow.Date;
            
            if (dates.Contains(checkDate) || dates.Contains(checkDate.AddDays(-1)))
            {
                if (!dates.Contains(checkDate)) checkDate = checkDate.AddDays(-1);
                
                foreach (var d in dates)
                {
                    if (d == checkDate)
                    {
                        streak++;
                        checkDate = checkDate.AddDays(-1);
                    }
                    else break;
                }
            }

            // Improvement (Latest session accuracy vs First session accuracy)
            decimal improvement = 0;
            if (sessions.Count >= 2)
            {
                var firstAcc = sessions.Last().Accuracy;
                var latestAcc = sessions.First().Accuracy;
                improvement = firstAcc > 0 ? ((latestAcc - firstAcc) / firstAcc) * 100 : 0;
            }

            ViewBag.TotalSessions = totalSessions;
            ViewBag.TotalTime = totalTimeFormatted;
            ViewBag.AvgAccuracy = Math.Round(avgAccuracy, 1);
            ViewBag.TotalScore = totalScore;
            ViewBag.DayStreak = streak;
            ViewBag.Improvement = Math.Round(improvement, 1);

            // Charts
            var last7Days = DateTime.UtcNow.AddDays(-7);
            var weeklySessions = sessions
                .Where(s => s.SessionDate >= last7Days)
                .GroupBy(s => s.SessionDate.Date)
                .Select(g => new { Date = g.Key, Count = g.Count(), AvgAccuracy = g.Average(x => x.Accuracy) })
                .OrderBy(g => g.Date)
                .ToList();
            
            var daysOfWeek = Enumerable.Range(0, 7).Select(i => DateTime.UtcNow.AddDays(-6 + i).Date).ToList();
            var weeklyActivityData = daysOfWeek.Select(d => weeklySessions.FirstOrDefault(w => w.Date == d)?.Count ?? 0).ToList();
            var weeklyAccuracyData = daysOfWeek.Select(d => Math.Round(weeklySessions.FirstOrDefault(w => w.Date == d)?.AvgAccuracy ?? 0, 1)).ToList();
            var weeklyLabels = daysOfWeek.Select(d => d.ToString("ddd")).ToList();

            var gameDistribution = sessions.GroupBy(s => s.Game?.Name ?? "Unknown")
                .Select(g => new { Name = g.Key, Count = g.Count() }).ToList();

            var last28Days = DateTime.UtcNow.AddDays(-28);
            var monthlySessions = sessions
                .Where(s => s.SessionDate >= last28Days)
                .GroupBy(s => (DateTime.UtcNow - s.SessionDate).Days / 7)
                .Select(g => new { 
                    WeekIndex = g.Key,
                    AvgAccuracy = g.Average(x => x.Accuracy), 
                    TotalTimeMin = g.Sum(x => x.DurationSeconds) / 60.0 
                })
                .ToList();

            var monthlyAccuracyData = Enumerable.Range(0, 4).Reverse().Select(i => Math.Round(monthlySessions.FirstOrDefault(m => m.WeekIndex == i)?.AvgAccuracy ?? 0, 1)).ToList();
            var monthlyTimeData = Enumerable.Range(0, 4).Reverse().Select(i => Math.Round(monthlySessions.FirstOrDefault(m => m.WeekIndex == i)?.TotalTimeMin ?? 0, 1)).ToList();
            var monthlyLabels = new List<string> { "Week 1", "Week 2", "Week 3", "Week 4" };

            ViewBag.WeeklyLabels = JsonSerializer.Serialize(weeklyLabels);
            ViewBag.WeeklyActivityData = JsonSerializer.Serialize(weeklyActivityData);
            ViewBag.WeeklyAccuracyData = JsonSerializer.Serialize(weeklyAccuracyData);
            
            ViewBag.DistributionLabels = JsonSerializer.Serialize(gameDistribution.Select(g => g.Name));
            ViewBag.DistributionData = JsonSerializer.Serialize(gameDistribution.Select(g => g.Count));

            ViewBag.MonthlyLabels = JsonSerializer.Serialize(monthlyLabels);
            ViewBag.MonthlyAccuracyData = JsonSerializer.Serialize(monthlyAccuracyData);
            ViewBag.MonthlyTimeData = JsonSerializer.Serialize(monthlyTimeData);

            return View();
        }
    }
}
