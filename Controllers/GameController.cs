using Microsoft.AspNetCore.Mvc;
using HandMotionPlay_.net.Data;
using Microsoft.EntityFrameworkCore;

namespace HandMotionPlay_.net.Controllers
{
    public class GameController : Controller
    {
        private readonly AppDbContext _context;

        public GameController(AppDbContext context)
        {
            _context = context;
        }
        public IActionResult Index()
        {
            return View();
        }
        public async Task<IActionResult> Game()
        {
            var totalGames = await _context.Games.CountAsync();
            var activePlayers = await _context.Users.CountAsync(); // Using total users as active players
            var sessionsToday = await _context.Sessions.Where(s => s.SessionDate.Date == DateTime.UtcNow.Date).CountAsync();
            var avgImprovement = await _context.Sessions.AverageAsync(s => (decimal?)s.Accuracy) ?? 0;

            ViewBag.TotalGames = totalGames;
            ViewBag.ActivePlayers = activePlayers;
            ViewBag.SessionsToday = sessionsToday;
            ViewBag.AvgImprovement = Math.Round(avgImprovement, 1);

            var activeGames = await _context.Games.Where(g => g.IsActive).OrderBy(g => g.Id).ToListAsync();

            return View(activeGames);
        }
        public IActionResult CanvaDrawing()
        {
            return View();
        }

        public IActionResult ShapeTracing()
        {
            return View();
        }

        public IActionResult TargetShooting()
        {
            return View();
        }
    }
}