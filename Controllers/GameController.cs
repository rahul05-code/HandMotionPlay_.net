using Microsoft.AspNetCore.Mvc;

namespace HandMotionPlay.Controllers
{
    public class GamesController : Controller
    {
        public IActionResult Manage()
        {
            return View();
        }
    }
}