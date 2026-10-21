import { expect, test, type Page } from "@playwright/test";

const testUser = {
  id: "user-1",
  name: "앱개발자",
  username: "developer",
  email: "developer@example.com",
};

const musicVideos = [
  {
    id: 101,
    title: "Midnight Blur",
    description: "",
    videoUrl: "/test-assets/video-1.mp4",
    durationSec: 127,
    fileSize: 6_500_000,
    playCount: 46,
    likeCount: 1,
    commentCount: 0,
    likedByMe: true,
    purchasedByMe: true,
    downloadPrice: 300,
    createdAt: "2026-06-15T00:00:00.000Z",
    creator: { id: "user-1", name: "앱개발자" },
  },
  {
    id: 102,
    title: '#18 “To Die of Love”',
    description: "",
    videoUrl: "/test-assets/video-2.mp4",
    durationSec: 204,
    fileSize: 7_600_000,
    playCount: 43,
    likeCount: 1,
    commentCount: 1,
    likedByMe: false,
    purchasedByMe: false,
    downloadPrice: 300,
    createdAt: "2026-06-14T00:00:00.000Z",
    creator: { id: "user-2", name: "업개발자" },
  },
  {
    id: 103,
    title: "Midnight Blur (3)",
    description: "",
    videoUrl: "/test-assets/video-3.mp4",
    durationSec: 127,
    fileSize: 6_200_000,
    playCount: 26,
    likeCount: 1,
    commentCount: 0,
    likedByMe: true,
    purchasedByMe: false,
    downloadPrice: 300,
    createdAt: "2026-06-14T00:00:00.000Z",
    creator: { id: "user-3", name: "업개발자" },
  },
  {
    id: 104,
    title: "Neon Rain",
    description: "",
    videoUrl: "/test-assets/video-4.mp4",
    durationSec: 146,
    fileSize: 5_900_000,
    playCount: 19,
    likeCount: 0,
    commentCount: 2,
    likedByMe: false,
    purchasedByMe: false,
    downloadPrice: 300,
    createdAt: "2026-06-13T00:00:00.000Z",
    creator: { id: "user-4", name: "업개발자" },
  },
  {
    id: 105,
    title: "Blue Hour",
    description: "",
    videoUrl: "/test-assets/video-5.mp4",
    durationSec: 188,
    fileSize: 8_100_000,
    playCount: 13,
    likeCount: 3,
    commentCount: 1,
    likedByMe: false,
    purchasedByMe: false,
    downloadPrice: 300,
    createdAt: "2026-06-12T00:00:00.000Z",
    creator: { id: "user-5", name: "업개발자" },
  },
];

async function mockVenySoundApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/me") {
      await route.fulfill({ json: testUser });
      return;
    }
    if (path === "/api/music-videos") {
      await route.fulfill({ json: route.request().method() === "GET" ? musicVideos : musicVideos[0] });
      return;
    }
    if (/^\/api\/music-videos\/\d+\/comments$/.test(path)) {
      await route.fulfill({ json: [] });
      return;
    }
    if (/^\/api\/music-videos\/\d+\/play$/.test(path)) {
      const id = Number(path.match(/music-videos\/(\d+)\/play/)?.[1] ?? 0);
      const video = musicVideos.find((item) => item.id === id);
      await route.fulfill({ json: { playCount: (video?.playCount ?? 0) + 1 } });
      return;
    }
    if (/^\/api\/music-videos\/\d+\/stream$/.test(path)) {
      await route.fulfill({
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-range": "bytes 0-0/1",
          "accept-ranges": "bytes",
        },
        body: Buffer.from([0]),
      });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.route("**/test-assets/*.mp4", async (route) => {
    await route.fulfill({
      status: 206,
      headers: {
        "content-type": "video/mp4",
        "content-range": "bytes 0-0/1",
        "accept-ranges": "bytes",
      },
      body: Buffer.from([0]),
    });
  });
}

test.describe("music video layout guards", () => {
  test.beforeEach(async ({ page }) => {
    await mockVenySoundApi(page);
  });

  test("desktop cards stay five across with compact three-line metadata", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop-only guard");

    await page.goto("/music-videos", { waitUntil: "domcontentloaded" });

    const grid = page.getByTestId("music-video-desktop-grid");
    await expect(grid).toBeVisible();
    await expect(page.getByTestId("music-video-card")).toHaveCount(5);

    const gridColumns = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(gridColumns).toBe(5);

    const firstCard = page.getByTestId("music-video-card").first();
    await expect(firstCard.getByRole("heading", { name: "Midnight Blur" })).toBeVisible();
    await expect(firstCard.getByTestId("music-video-card-meta")).toContainText("앱개발자");
    await expect(firstCard.getByTestId("music-video-card-meta")).toContainText("6.2MB");

    const actionRow = firstCard.getByTestId("music-video-card-actions");
    await expect(actionRow).toBeVisible();
    const actionLayout = await actionRow.evaluate((el) => {
      const tops = Array.from(el.children).map((child) => Math.round(child.getBoundingClientRect().top));
      return { uniqueRows: new Set(tops).size, itemCount: el.children.length };
    });
    expect(actionLayout.itemCount).toBeGreaterThanOrEqual(4);
    expect(actionLayout.uniqueRows).toBe(1);
  });

  test("mobile uses native one-slide vertical snapping with visible action rail", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile-only guard");

    await page.goto("/music-videos", { waitUntil: "domcontentloaded" });

    const scroller = page.getByTestId("music-video-mobile-scroller");
    await expect(scroller).toBeVisible();
    await expect(page.getByTestId("music-video-mobile-slide")).toHaveCount(5);

    const scrollContract = await scroller.evaluate((el) => {
      const style = getComputedStyle(el);
      const firstSlide = el.querySelector("[data-testid='music-video-mobile-slide']");
      const firstSlideStyle = firstSlide ? getComputedStyle(firstSlide) : null;
      return {
        overflowY: style.overflowY,
        snapType: style.scrollSnapType,
        snapAlign: firstSlideStyle?.scrollSnapAlign ?? "",
        snapStop: firstSlideStyle?.scrollSnapStop ?? "",
      };
    });

    expect(scrollContract.overflowY).toBe("auto");
    expect(scrollContract.snapType).toContain("y");
    expect(scrollContract.snapType).toContain("mandatory");
    expect(scrollContract.snapAlign).toContain("start");
    expect(scrollContract.snapStop).toBe("always");

    await expect(page.getByTestId("music-video-mobile-actions").first()).toBeVisible();
  });
});
