using Microsoft.AspNetCore.Mvc;

namespace HandMotionPlay_.net.Controllers
{
    public class ProfileController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }

        public IActionResult Profile()
        {
            return View();
        }
    }
}
