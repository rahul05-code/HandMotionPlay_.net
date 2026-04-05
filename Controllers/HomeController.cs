using System.Diagnostics;
using HandMotionPlay_.net.Models;
using Microsoft.AspNetCore.Mvc;
using HandMotionPlay_.net.Data;
using Microsoft.EntityFrameworkCore;

namespace HandMotionPlay_.net.Controllers
{
    public class HomeController : Controller
    {
        private readonly ILogger<HomeController> _logger;
        private readonly AppDbContext _context;

        public HomeController(ILogger<HomeController> logger, AppDbContext context)
        {
            _logger = logger;
            _context = context;
        }

        public async Task<IActionResult> Index()
        {
            var totalUsers = await _context.Users.CountAsync();
            var totalGamesPlayed = await _context.Sessions.CountAsync();
            var improvementRate = await _context.Sessions.AverageAsync(x => (decimal?)x.Accuracy) ?? 0;
            var exerciseTypes = await _context.Games.CountAsync();

            ViewBag.TotalUsers = totalUsers;
            ViewBag.TotalGamesPlayed = totalGamesPlayed;
            ViewBag.ImprovementRate = Math.Round(improvementRate, 1);
            ViewBag.ExerciseTypes = exerciseTypes;

            return View();
        }

        public IActionResult Privacy()
        {
            return View();
/*helloo*/
        }
        public IActionResult CanvaDrawing()
        {
            return View();
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }  
    }
}
