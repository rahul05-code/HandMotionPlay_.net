using HandMotionPlay_.net.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HandMotionPlay_.net.Controllers
{
    public class AdminDashboardController : Controller
    {
        private readonly AppDbContext _context;

        public AdminDashboardController(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IActionResult> Index()
        {
            var totalUsers = await _context.Users.CountAsync();
            var totalSessions = await _context.Sessions.CountAsync();
            var totalScore = await _context.Sessions.SumAsync(x => (long?)x.Score) ?? 0;
            var avgAccuracy = await _context.Sessions.AverageAsync(x => (decimal?)x.Accuracy) ?? 0;

            ViewBag.TotalUsers = totalUsers;
            ViewBag.TotalSessions = totalSessions;
            ViewBag.TotalScore = totalScore;
            ViewBag.AvgAccuracy = avgAccuracy;

            return View();
        }
    }
}
