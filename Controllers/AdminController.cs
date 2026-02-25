using Microsoft.AspNetCore.Mvc;

namespace HandMotionPlay_.net.Controllers
{
    public class AdminController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }

        public IActionResult Manage()
        {
            return View();
        }


    }
}
