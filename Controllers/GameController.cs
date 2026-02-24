using Microsoft.AspNetCore.Mvc;

namespace HandMotionPlay_.net.Controllers
{
    public class GameController : Controller
    {
        public IActionResult Index()
        {
            return View();
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
