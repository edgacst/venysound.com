import { db } from "./db";
import { music, users, posts, postComments } from "@shared/schema";
import { sql } from "drizzle-orm";

const demoUsers = [
  { id: "demo_user_1", email: "demo1@venysound.com", firstName: "김민지" },
  { id: "demo_user_2", email: "demo2@venysound.com", firstName: "이준혁" },
  { id: "demo_user_3", email: "demo3@venysound.com", firstName: "박수진" },
  { id: "demo_user_4", email: "demo4@venysound.com", firstName: "정태형" },
  { id: "demo_user_5", email: "demo5@venysound.com", firstName: "최유나" },
];

const demoMusic = [
  {
    title: "빛이 지는 그자리",
    artist: "김민지",
    filename: "/objects/uploads/b82f8a15-6e5a-4de7-8258-5d8e3783696e",
    imageFilename: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop",
    genre: "발라드",
    tags: "봄,감성,어쿠스틱",
    isAi: true,
    price: 0,
    isDownloadable: false,
    userId: "demo_user_1",
  },
  {
    title: "어디로 가야할까",
    artist: "이준혁",
    filename: "/objects/uploads/ccb27cd5-1e8f-4164-9473-5ebe0162b1b3",
    imageFilename: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop",
    genre: "국내가요",
    tags: "도시,밤,신나는",
    isAi: true,
    price: 0,
    isDownloadable: false,
    userId: "demo_user_2",
  },
  {
    title: "주와 함께라면",
    artist: "박수진",
    filename: "/objects/uploads/7c3f70e6-7fd6-46bb-9a95-b4ce519196ab",
    imageFilename: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&h=400&fit=crop",
    genre: "발라드",
    tags: "새벽,감성,잔잔한",
    isAi: true,
    price: 0,
    isDownloadable: false,
    userId: "demo_user_3",
  },
  {
    title: "바람이 불어오면 생각나",
    artist: "정태형",
    filename: "/objects/uploads/d2f426df-28c3-4168-98a7-d982d2130bc9",
    imageFilename: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=400&fit=crop",
    genre: "발라드",
    tags: "여름,바다,시원한",
    isAi: true,
    price: 0,
    isDownloadable: false,
    userId: "demo_user_4",
  },
  {
    title: "The City's Getting Soaked Tonight",
    artist: "최유나",
    filename: "/objects/uploads/4f108ebe-b05a-422f-9104-a50db7aa8fcc",
    imageFilename: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=400&h=400&fit=crop",
    genre: "팝뮤직",
    tags: "재즈,밤,로맨틱",
    isAi: true,
    price: 0,
    isDownloadable: false,
    userId: "demo_user_5",
  },
  {
    title: "In the Quiet of the Evening",
    artist: "김민지",
    filename: "/objects/uploads/6c3d8d2c-3486-4a8f-a607-fc02b0cebb2c",
    imageFilename: "https://images.unsplash.com/photo-1614149162883-504ce4d13909?w=400&h=400&fit=crop",
    genre: "팝뮤직",
    tags: "AI,전자음악,미래",
    isAi: true,
    price: 0,
    isDownloadable: false,
    userId: "demo_user_1",
  },
  {
    title: "When the Daylight Softly Settles",
    artist: "이준혁",
    filename: "/objects/uploads/1a590943-c384-4cc1-b557-ba9239aaa402",
    imageFilename: "https://images.unsplash.com/photo-1501612780327-45045538702b?w=400&h=400&fit=crop",
    genre: "팝뮤직",
    tags: "카페,아코디언,포근한",
    isAi: true,
    price: 0,
    isDownloadable: false,
    userId: "demo_user_2",
  },
  {
    title: "햇살에 어른거리는",
    artist: "박수진",
    filename: "/objects/uploads/187fe297-32ac-448d-8823-ab4657f3fa27",
    imageFilename: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop",
    genre: "국내가요",
    tags: "한강,노을,기타",
    isAi: true,
    price: 0,
    isDownloadable: false,
    userId: "demo_user_3",
  },
  {
    title: "I'm Just Calling You (그냥 불러 봐)",
    artist: "정태형",
    filename: "/objects/uploads/9189b663-d000-4554-be98-507231339485",
    imageFilename: "https://images.unsplash.com/photo-1499346030926-9a72daac6c63?w=400&h=400&fit=crop",
    genre: "케이팝",
    tags: "비,감성,피아노",
    isAi: true,
    price: 0,
    isDownloadable: false,
    userId: "demo_user_4",
  },
  {
    title: "너를 만난 그 순간부터 (듀엣)",
    artist: "김민지",
    filename: "/objects/uploads/c01391a8-7606-4064-ac42-615a41c65bd0",
    imageFilename: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=400&h=400&fit=crop",
    genre: "발라드",
    tags: "가을,편지,감성",
    isAi: true,
    price: 0,
    isDownloadable: false,
    userId: "demo_user_1",
  },
  {
    title: "사랑했지만",
    artist: "이준혁",
    filename: "/objects/uploads/cbe35628-5e70-4238-9384-b960161b85c1",
    imageFilename: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop",
    genre: "발라드",
    tags: "네온,미래,전자",
    isAi: true,
    price: 0,
    isDownloadable: false,
    userId: "demo_user_2",
  },
];

const demoPosts = [
  {
    title: "최근에 발견한 인디 아티스트 추천합니다!",
    content: "요즘 들으면서 정말 감동받은 인디 아티스트가 있는데요, 깔끔한 어쿠스틱 기타에 감성적인 보컬이 너무 좋아요. 특히 \"새벽 감성\"이라는 곡이 정말 좋습니다. 여러분도 한번 들어보세요!",
    userId: "demo_user_1",
    category: "음악추천",
  },
  {
    title: "AI로 음악 만들어본 후기",
    content: "AI 음악 생성 도구를 사용해서 곡을 만들어봤는데, 생각보다 퀄리티가 좋아서 놀랐어요. 물론 사람이 만든 음악의 감성을 완전히 따라가진 못하지만, 작곡 아이디어를 얻는 데는 정말 유용한 것 같습니다.",
    userId: "demo_user_2",
    category: "자유",
  },
  {
    title: "홈레코딩 장비 추천 부탁드려요",
    content: "집에서 녹음을 시작하려고 하는데, 초보자에게 추천하는 마이크와 오디오 인터페이스가 있을까요? 예산은 50만원 정도입니다. 주로 보컬과 어쿠스틱 기타를 녹음할 예정이에요.",
    userId: "demo_user_3",
    category: "질문",
  },
  {
    title: "Veny Sound 사용 후기",
    content: "Veny Sound에서 제 음악을 공유하기 시작한 지 한 달이 됐는데요, 정말 좋은 플랫폼이라고 생각합니다. 다양한 장르의 음악을 쉽게 찾아들을 수 있고, 커뮤니티 분위기도 따뜻해요.",
    userId: "demo_user_4",
    category: "후기",
  },
  {
    title: "이번 주 발라드 플레이리스트 공유",
    content: "비 오는 날에 듣기 좋은 발라드 모음을 만들었어요. \"봄날의 산책\", \"비 오는 날\", \"가을 편지\" 등을 포함했는데, 하나하나 정말 감성적인 곡들이에요. 추천드립니다!",
    userId: "demo_user_5",
    category: "음악추천",
  },
  {
    title: "믹싱/마스터링 팁 공유합니다",
    content: "DAW에서 믹싱할 때 자주 쓰는 꿀팁을 공유합니다.\n1. EQ로 불필요한 저음역대 정리\n2. 컴프레서는 자연스럽게 설정\n3. 리버브는 적당히 사용\n4. 레퍼런스 트랙과 자주 비교\n도움이 되셨으면 좋겠어요!",
    userId: "demo_user_1",
    category: "정보",
  },
  {
    title: "[콜라보] 보컬리스트 구합니다 - R&B 트랙",
    content: "안녕하세요! R&B 장르의 트랙을 작업 중인데 보컬리스트를 찾고 있습니다.\n\n장르: R&B / 소울\n분위기: 감성적이고 부드러운 느낌\n키: C Major\nBPM: 85\n\n관심 있으신 분은 댓글이나 DM 부탁드려요! 데모 트랙 공유 가능합니다.",
    userId: "demo_user_2",
    category: "콜라보",
  },
  {
    title: "[콜라보] 기타리스트 + 작곡가 협업 원해요",
    content: "어쿠스틱 기타 연주를 하고 있는데, 작곡에 관심 있는 분과 함께 곡을 만들어보고 싶습니다.\n\n저는 핑거스타일 위주로 연주하고, 발라드나 포크 장르를 좋아해요.\n녹음 장비도 갖추고 있어서 깔끔한 녹음이 가능합니다.\n\n같이 작업하실 분 연락주세요!",
    userId: "demo_user_3",
    category: "콜라보",
  },
  {
    title: "[콜라보] 힙합 비트 교환하실 분!",
    content: "힙합/트랩 비트를 만들고 있습니다. 서로 비트를 교환하면서 영감을 주고받을 프로듀서분을 찾습니다.\n\nFL Studio 사용 중이고, 주로 다크한 느낌의 트랩 비트를 만들어요.\n프로젝트 파일 공유도 가능합니다.\n\n관심 있으신 분 댓글 남겨주세요!",
    userId: "demo_user_4",
    category: "콜라보",
  },
  {
    title: "[콜라보] 뮤직비디오 촬영 같이 하실 분",
    content: "다음 달에 신곡 발매 예정인데, 뮤직비디오를 같이 만들어볼 영상 크리에이터를 찾습니다.\n\n장르: 인디 팝\n촬영 장소: 서울 (야외 위주)\n예상 기간: 2-3일\n\n포트폴리오 있으시면 같이 공유해요! 좋은 작품 만들어봐요.",
    userId: "demo_user_5",
    category: "콜라보",
  },
];

export async function seedDatabase() {
  try {
    for (const user of demoUsers) {
      await db
        .insert(users)
        .values(user)
        .onConflictDoNothing();
    }

    const musicResult = await db.select({ count: sql<number>`count(*)` }).from(music);
    const musicCount = Number(musicResult[0].count);

    if (musicCount === 0) {
      console.log("[seed] No music found, seeding demo music...");
      for (const m of demoMusic) {
        await db.insert(music).values(m);
      }
      console.log(`[seed] Inserted ${demoMusic.length} demo music tracks.`);
    }

    const postResult = await db.select({ count: sql<number>`count(*)` }).from(posts);
    const postCount = Number(postResult[0].count);

    if (postCount <= 1) {
      console.log("[seed] Few posts found, seeding demo community posts...");
      for (const p of demoPosts) {
        await db.insert(posts).values(p);
      }
      console.log(`[seed] Inserted ${demoPosts.length} demo community posts.`);
    } else {
      const collabResult = await db.select({ count: sql<number>`count(*)` }).from(posts).where(sql`category = '콜라보'`);
      const collabCount = Number(collabResult[0].count);
      if (collabCount === 0) {
        console.log("[seed] No collab posts found, seeding collab posts...");
        const collabPosts = demoPosts.filter(p => p.category === "콜라보");
        for (const p of collabPosts) {
          await db.insert(posts).values(p);
        }
        console.log(`[seed] Inserted ${collabPosts.length} collab posts.`);
      }
    }

    console.log("[seed] Database seed check complete.");
  } catch (error) {
    console.error("[seed] Error seeding database:", error);
  }
}
