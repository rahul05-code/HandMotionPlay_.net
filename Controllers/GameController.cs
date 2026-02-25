using Microsoft.AspNetCore.Mvc;

namespace HandMotionPlay.Controllers
{
    public class GamesController : Controller
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