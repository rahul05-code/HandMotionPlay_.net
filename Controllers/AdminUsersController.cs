using HandMotionPlay_.net.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HandMotionPlay_.net.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AdminUsersController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AdminUsersController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllUsers()
        {
            var users = await _context.Users
                .Include(u => u.UserStat)
                .ToListAsync();

            return Ok(users);
        }

        [HttpPut("change-status/{id}")]
        public async Task<IActionResult> ChangeStatus(Guid id, [FromQuery] string status)
        {
            var user = await _context.Users.FindAsync(id);

            if (user == null)
                return NotFound();

            user.Status = status;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Status updated" });
        }
    }
}
