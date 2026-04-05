using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using HandMotionPlay_.net.Data;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using HandMotionPlay_.net.Models;

namespace HandMotionPlay_.net.Controllers
{
    [Authorize]
    public class ProfileController : Controller
    {
        private readonly AppDbContext _context;

        public ProfileController(AppDbContext context)
        {
            _context = context;
        }

        public IActionResult Index()
        {
            return RedirectToAction("Profile");
        }

        public async Task<IActionResult> Profile()
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdStr, out Guid userId)) return RedirectToAction("Login", "Account");

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return NotFound();

            var sessions = await _context.Sessions.Where(s => s.UserId == userId).ToListAsync();

            ViewBag.User = user;
            ViewBag.TotalSessions = sessions.Count;
            ViewBag.TotalScore = sessions.Sum(s => s.Score);
            ViewBag.BestSession = sessions.Any() ? sessions.Max(s => s.Score) : 0;
            ViewBag.AvgSession = sessions.Any() ? Math.Round(sessions.Average(s => s.Score), 0) : 0;
            
            return View();
        }

        [HttpPost]
        public async Task<IActionResult> UpdateProfile(string name, string email)
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdStr, out Guid userId)) return RedirectToAction("Login", "Account");

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user != null)
            {
                user.Name = name;
                user.Email = email;
                await _context.SaveChangesAsync();
            }

            return RedirectToAction("Profile");
        }
    }
}
