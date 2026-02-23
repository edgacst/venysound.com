import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { usePosts, useCreatePost } from "@/hooks/use-community";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Heart, Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko, ja, zhCN } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPostSchema } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';

const categories = ["전체", "자유", "음악추천", "질문", "정보", "후기", "콜라보"];
const POSTS_PER_PAGE = 10;

export default function Community() {
  const { t, i18n } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { data: posts, isLoading } = usePosts({ 
    category: selectedCategory,
    search: searchQuery 
  });
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { mutate: createPost } = useCreatePost();

  const totalPages = useMemo(() => {
    if (!posts) return 1;
    return Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
  }, [posts]);

  const paginatedPosts = useMemo(() => {
    if (!posts) return [];
    const start = (currentPage - 1) * POSTS_PER_PAGE;
    return posts.slice(start, start + POSTS_PER_PAGE);
  }, [posts, currentPage]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat === "전체" ? undefined : cat);
    setCurrentPage(1);
  };

  const form = useForm({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      title: "",
      content: "",
      category: "자유"
    }
  });

  const onSubmit = (values: any) => {
    createPost(values, {
      onSuccess: () => {
        setIsCreateOpen(false);
        form.reset();
        setCurrentPage(1);
      }
    });
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
      
        <div className="container max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <h1 className="text-3xl font-display font-bold" data-testid="text-community-title">{t('community.title')}</h1>
          
          {user && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" data-testid="button-new-post">
                  <Plus size={18} /> {t('community.newPost')}
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle>{t('community.newPostTitle')}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('community.category')}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-category">
                                <SelectValue placeholder={t('community.categoryPlaceholder')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categories.filter(c => c !== "전체").map(cat => (
                                <SelectItem key={cat} value={cat}>{t(`community.categories.${cat}`)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('community.postTitle')}</FormLabel>
                          <FormControl>
                            <Input placeholder={t('community.postTitlePlaceholder')} {...field} data-testid="input-post-title" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('community.content')}</FormLabel>
                          <FormControl>
                            <Textarea placeholder={t('community.contentPlaceholder')} {...field} data-testid="input-post-content" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" data-testid="button-submit-post">{t('community.submit')}</Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="flex gap-3 mb-6 items-center flex-wrap">
          <div className="flex gap-2 overflow-x-auto flex-1">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                data-testid={`button-category-${cat}`}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  (selectedCategory === cat || (cat === "전체" && !selectedCategory))
                    ? "bg-primary text-white"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                }`}
              >
                {t(`community.categories.${cat}`)}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              placeholder={t('community.searchPlaceholder')}
              className="pl-9 bg-secondary/50 border-white/5"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              data-testid="input-search-post"
            />
          </div>
        </div>

        <div className="space-y-2">
          {(paginatedPosts as PostWithUser[]).map((post) => (
            <Link key={post.id} href={`/community/${post.id}`}>
              <Card className="border-white/5 bg-card/50 hover-elevate cursor-pointer px-4 py-3" data-testid={`card-post-${post.id}`}>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={post.user?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-xs">{post.user?.firstName?.[0] || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {post.category && (
                        <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full shrink-0">{post.category}</span>
                      )}
                      <span className="text-sm font-medium truncate" data-testid={`text-post-title-${post.id}`}>{post.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{post.content}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessageSquare size={12} />
                      {t('community.comments')}
                    </span>
                    <span className="hidden sm:inline">
                      {post.user?.firstName || t('community.anonymous')}
                    </span>
                    <span className="hidden sm:inline">
                      {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: i18n.language === 'ko' ? ko : i18n.language === 'ja' ? ja : i18n.language === 'zh' ? zhCN : undefined }) : ''}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}

          {posts?.length === 0 && !isLoading && (
            <div className="text-center py-20 text-muted-foreground" data-testid="text-no-posts">
              {t('community.noPosts')}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6" data-testid="pagination">
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              data-testid="button-prev-page"
            >
              <ChevronLeft size={16} />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <Button
                key={page}
                variant={page === currentPage ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
                data-testid={`button-page-${page}`}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              data-testid="button-next-page"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        )}
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
