using HandMotionPlay_.net.Data;
using HandMotionPlay_.net.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using System.IO;
using System.Threading.Tasks;

namespace HandMotionPlay_.net.Controllers
{
    public class AdminGamesController : Controller
    {
        private readonly AppDbContext _context;
        private readonly IWebHostEnvironment _webHostEnvironment;

        public AdminGamesController(AppDbContext context, IWebHostEnvironment webHostEnvironment)
        {
            _context = context;
            _webHostEnvironment = webHostEnvironment;
        }

        public async Task<IActionResult> Index()
        {
            var games = await _context.Games
                .Include(g => g.GameStat)
                .OrderBy(g => g.Id)
                .ToListAsync();

            return View(games);
        }

        public IActionResult Create()
        {
            return View();
        }

        [HttpPost]
        public async Task<IActionResult> Create(GameModel model)
        {
            ModelState.Remove("GameStat");
            ModelState.Remove("Sessions");

            if (ModelState.IsValid)
            {
                _context.Games.Add(model);
                await _context.SaveChangesAsync();
                return RedirectToAction(nameof(Index));
            }
            return View(model);
        }

        public async Task<IActionResult> Edit(int id)
        {
            var game = await _context.Games.FindAsync(id);
            if (game == null) return NotFound();
            return View(game);
        }

        [HttpPost]
        public async Task<IActionResult> Edit(int id, GameModel model)
        {
            if (id != model.Id) return NotFound();

            ModelState.Remove("GameStat");
            ModelState.Remove("Sessions");

            if (ModelState.IsValid)
            {
                try
                {
                    var existingGame = await _context.Games.FindAsync(id);
                    if (existingGame == null) return NotFound();

                    existingGame.Name = model.Name;
                    existingGame.Description = model.Description;
                    existingGame.Difficulty = model.Difficulty;
                    existingGame.Benefits = model.Benefits;
                    existingGame.ActionName = model.ActionName;
                    existingGame.IsActive = model.IsActive;

                    _context.Update(existingGame);
                    await _context.SaveChangesAsync();
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!GameExists(model.Id)) return NotFound();
                    else throw;
                }
                return RedirectToAction(nameof(Index));
            }
            return View(model);
        }

        [HttpPost]
        public async Task<IActionResult> ToggleActive(int id)
        {
            var game = await _context.Games.FindAsync(id);
            if (game != null)
            {
                game.IsActive = !game.IsActive;
                await _context.SaveChangesAsync();
            }
            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> Delete(int id) // changed to int since GameModel.Id is int, previous code had Guid
        {
            var game = await _context.Games.FindAsync(id);
            if (game != null)
            {
                _context.Games.Remove(game);
                await _context.SaveChangesAsync();
            }
            return RedirectToAction(nameof(Index));
        }

        private bool GameExists(int id)
        {
            return _context.Games.Any(e => e.Id == id);
        }
    }
}
