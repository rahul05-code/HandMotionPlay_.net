using HandMotionPlay_.net.Data;
using HandMotionPlay_.net.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HandMotionPlay_.net.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AdminGamesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AdminGamesController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllGames()
        {
            var games = await _context.Games
                .Include(g => g.GameStat)
                .ToListAsync();

            return Ok(games);
        }

        [HttpPost("add")]
        public async Task<IActionResult> AddGame(GameModel model)
        {
            _context.Games.Add(model);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Game added successfully" });
        }
    }
}
