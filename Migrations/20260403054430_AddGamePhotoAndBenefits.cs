using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HandMotionPlay_.net.Migrations
{
    /// <inheritdoc />
    public partial class AddGamePhotoAndBenefits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActionName",
                table: "Games",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Benefits",
                table: "Games",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhotoPath",
                table: "Games",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ActionName",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "Benefits",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "PhotoPath",
                table: "Games");
        }
    }
}
