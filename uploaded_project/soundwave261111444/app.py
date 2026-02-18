# 인기 음원(좋아요 순) 페이지
# --- 필수 라이브러리 import (중복 제거 및 정리) ---
from sqlalchemy import func
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from datetime import datetime
from flask import Flask, render_template, request, redirect, flash, url_for, send_from_directory, jsonify
from flask_socketio import SocketIO, emit
import os
import jinja2
from urllib.parse import urlparse
from werkzeug.utils import secure_filename
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash


def _safe_referrer(fallback):
    ref = request.referrer
    if ref:
        parsed = urlparse(ref)
        if parsed.netloc == "" or parsed.netloc == urlparse(request.host_url).netloc:
            return ref
    return fallback


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Flask & SocketIO
app = Flask(__name__, template_folder='templates')
socketio = SocketIO(app, async_mode='threading')
# 환경변수에서 SECRET_KEY, DEBUG 값을 읽어옴 (없으면 기본값 사용)
app.secret_key = os.environ.get('SECRET_KEY', 'soundwave-secret-key-2024')
app.debug = os.environ.get('DEBUG', 'False').lower() == 'true'
app.config['TEMPLATES_AUTO_RELOAD'] = True

import sys
sys.setrecursionlimit(2000)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'instance', 'soundwave.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
migrate = Migrate(app, db)
login_manager = LoginManager(app)
login_manager.login_view = 'login_page'
login_manager.login_message = '로그인이 필요합니다'

# --- 알림(Notification) 모델 추가 ---
class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)  # 알림을 받는 유저
    type = db.Column(db.String(50), nullable=False)  # 'like', 'comment', 'follow', 'system' 등
    message = db.Column(db.String(255), nullable=False)
    url = db.Column(db.String(255), nullable=True)  # 클릭 시 이동할 URL
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user = db.relationship('User', backref=db.backref('notifications', lazy=True, cascade="all, delete-orphan"))

# --- 알림 생성 함수 ---
def create_notification(user_id, type, message, url=None):
    notif = Notification(user_id=user_id, type=type, message=message, url=url)
    db.session.add(notif)
    db.session.commit()

# --- 알림 피드 라우트 ---
@app.route('/notifications')
@login_required
def notifications():
    notifs = Notification.query.filter_by(user_id=current_user.id).order_by(Notification.created_at.desc()).all()
    return render_template('notifications.html', notifications=notifs)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# 좋아요 기능을 위한 연관 테이블
likes = db.Table('likes',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('music_id', db.Integer, db.ForeignKey('music.id'), primary_key=True)
)

# 팔로우 기능을 위한 연관 테이블
follows = db.Table('follows',
    db.Column('follower_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('followed_id', db.Integer, db.ForeignKey('user.id'), primary_key=True)
)

# ====== 여기에 Music 모델 추가 ======
class Music(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    artist = db.Column(db.String(100), nullable=False)
    filename = db.Column(db.String(200), nullable=False)
    image_filename = db.Column(db.String(200), nullable=True)
    genre = db.Column(db.String(50), nullable=True)
    tags = db.Column(db.String(200), nullable=True)  # 콤마(,)로 구분된 태그 문자열
    is_ai = db.Column(db.Boolean, default=False)  # AI 음원 여부
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    uploader = db.relationship('User', backref=db.backref('uploaded_music', lazy=True))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    reviews = db.relationship('Review', backref='music', lazy=True, cascade="all, delete-orphan")
    
    def __repr__(self):
        return f'<Music {self.title}>'
# User 모델 정의 (db = SQLAlchemy(app) 밑에 추가)

class User(UserMixin, db.Model):  # UserMixin 추가
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    liked_music = db.relationship('Music', secondary=likes, backref=db.backref('liked_by', lazy='dynamic'))

    # 팔로우 관계
    followed = db.relationship(
        'User', secondary=follows,
        primaryjoin=(follows.c.follower_id == id),
        secondaryjoin=(follows.c.followed_id == id),
        backref=db.backref('followers', lazy='dynamic'),
        lazy='dynamic'
    )

    def follow(self, user):
        if not self.is_following(user):
            self.followed.append(user)

    def unfollow(self, user):
        if self.is_following(user):
            self.followed.remove(user)

    def is_following(self, user):
        return self.followed.filter(follows.c.followed_id == user.id).count() > 0

    def followed_users_uploads(self):
        # 팔로우한 유저들의 업로드 음원
        from itertools import chain
        uploads = list(chain.from_iterable(user.uploaded_music for user in self.followed))
        return sorted(uploads, key=lambda m: m.created_at, reverse=True)

    def __repr__(self):
        return f'<User {self.username}>'

    # 비밀번호 설정 메서드
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    # 비밀번호 확인 메서드
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# 리뷰 모델 정의
class Review(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    music_id = db.Column(db.Integer, db.ForeignKey('music.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('reviews', lazy=True))

# --- 커뮤니티 게시글(Post) 모델 추가 ---
class Post(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('posts', lazy=True, cascade="all, delete-orphan"))
    category = db.Column(db.String(50), nullable=True)
    attachment = db.Column(db.String(255), nullable=True)  # 파일 첨부 경로

# --- 커뮤니티 댓글(Comment) 모델 추가 ---
class PostComment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    post_id = db.Column(db.Integer, db.ForeignKey('post.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('post_comments', lazy=True))
    post = db.relationship('Post', backref=db.backref('comments', lazy=True, cascade="all, delete-orphan"))

# 플레이리스트-음원 관계 테이블
playlist_music = db.Table('playlist_music',
    db.Column('playlist_id', db.Integer, db.ForeignKey('playlist.id'), primary_key=True),
    db.Column('music_id', db.Integer, db.ForeignKey('music.id'), primary_key=True)
)

# 플레이리스트 모델
class Playlist(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    musics = db.relationship('Music', secondary=playlist_music, backref=db.backref('playlists', lazy='dynamic'))
    user = db.relationship('User', backref=db.backref('playlists', lazy=True))

    def __repr__(self):
        return f'<Playlist {self.name}>'
    
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB
app.config['ALLOWED_EXTENSIONS'] = {'mp3', 'wav', 'ogg'}
app.config['ALLOWED_IMAGE_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif'}

# --- 파일 확장자 체크 함수 (보안 강화 필요: 실제 서비스 시 파일 내용 검사 권장) ---
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def allowed_image_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_IMAGE_EXTENSIONS']


# 실시간 접속자 수 관리
current_visitors = 0

@app.route('/')
def home():
    recent_music = Music.query.order_by(Music.created_at.desc()).limit(8).all()
    return render_template('index.html', recent_music=recent_music, total_count=Music.query.count(), current_user=current_user)

# SocketIO 이벤트: 접속/해제 시 접속자 수 관리
@socketio.on('connect')
def handle_connect():
    global current_visitors
    current_visitors += 1
    emit('visitor_count', {'count': current_visitors}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    global current_visitors
    if current_visitors > 0:
        current_visitors -= 1
    emit('visitor_count', {'count': current_visitors}, broadcast=True)

# 업로드 페이지 라우트
@app.route('/upload')
@login_required
def upload_page():
    return render_template('upload.html')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/register')
def register_page():
    return render_template('register.html')

@app.route('/about')
def about_page():
    return render_template('about.html')

@app.route('/legal')
def legal_page():
    return render_template('legal.html')

# FAQ 페이지 라우트 추가
@app.route('/faq')
def faq_page():
    return render_template('faq.html')

# --- 팔로우/언팔로우 라우트 추가 ---
@app.route('/follow/<int:user_id>', methods=['POST'])
@login_required
def follow_user(user_id):
    user_to_follow = User.query.get_or_404(user_id)
    if user_to_follow == current_user:
        flash('자기 자신은 팔로우할 수 없습니다.', 'error')
        return redirect(_safe_referrer(url_for('home')))
    if not current_user.is_following(user_to_follow):
        current_user.follow(user_to_follow)
        db.session.commit()
        # 알림 생성
        create_notification(
            user_id=user_to_follow.id,
            type='follow',
            message=f'[{current_user.username}]님이 회원님을 팔로우했습니다.',
            url=url_for('profile_page')
        )
        flash(f'{user_to_follow.username}님을 팔로우했습니다.', 'success')
    else:
        flash('이미 팔로우 중입니다.', 'info')
    return redirect(_safe_referrer(url_for('home')))

# --- 커뮤니티 게시판 라우트 ---
@app.route('/community')
def community_list():
    # 검색 및 카테고리 필터
    search_query = request.args.get('q', '').strip()
    category = request.args.get('category', '').strip()
    query = Post.query
    if category:
        query = query.filter_by(category=category)
    if search_query:
        query = query.filter(Post.title.contains(search_query) | Post.content.contains(search_query))
    posts = query.order_by(Post.created_at.desc()).all()
    # 카테고리 목록 추출
    categories = [r[0] for r in db.session.query(Post.category).distinct().all() if r[0]]
    return render_template('community_list.html', posts=posts, categories=categories, current_category=category, search_query=search_query)

@app.route('/community/<int:post_id>', methods=['GET', 'POST'])
def community_detail(post_id):
    # 커뮤니티 상세: 템플릿 없을 시 사용자 친화적 에러 처리 권장
    try:
        template_source = app.jinja_loader.get_source(app.jinja_env, 'community_detail2.html')
    except jinja2.exceptions.TemplateNotFound:
        # 실제 서비스에서는 사용자에게 안내 메시지 제공 권장
        return "템플릿 파일이 존재하지 않습니다.", 500
    post = Post.query.get_or_404(post_id)
    if request.method == 'POST' and current_user.is_authenticated:
        content = request.form.get('comment_content', '').strip()
        if content:
            comment = PostComment(content=content, user_id=current_user.id, post_id=post.id)
            db.session.add(comment)
            db.session.commit()
            flash('댓글이 등록되었습니다.', 'success')
            return redirect(url_for('community_detail', post_id=post.id))
        else:
            flash('댓글 내용을 입력하세요.', 'error')
    return render_template('community_detail2.html', post=post)

@app.route('/community/new', methods=['GET', 'POST'])
@login_required
def community_create():
    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        content = request.form.get('content', '').strip()
        category = request.form.get('category', '').strip()
        attachment = None
        # 파일 첨부 처리
        if 'attachment' in request.files:
            file = request.files['attachment']
            if file and file.filename != '':
                filename = secure_filename(file.filename)
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                filename = f"post_{timestamp}_{filename}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                attachment = filename
        if not title or not content:
            flash('제목과 내용을 모두 입력하세요.', 'error')
            return render_template('community_form.html')
        post = Post(title=title, content=content, user_id=current_user.id, category=category, attachment=attachment)
        db.session.add(post)
        db.session.commit()
        flash('게시글이 등록되었습니다.', 'success')
        return redirect(url_for('community_list'))
    # 카테고리 목록 전달
    categories = [r[0] for r in db.session.query(Post.category).distinct().all() if r[0]]
    return render_template('community_form.html', categories=categories)

@app.route('/community/<int:post_id>/edit', methods=['GET', 'POST'])
@login_required
def community_edit(post_id):
    post = Post.query.get_or_404(post_id)
    if post.user_id != current_user.id:
        flash('수정 권한이 없습니다.', 'error')
        return redirect(url_for('community_detail', post_id=post_id))
    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        content = request.form.get('content', '').strip()
        category = request.form.get('category', '').strip()
        # 파일 첨부 수정
        if 'attachment' in request.files:
            file = request.files['attachment']
            if file and file.filename != '':
                filename = secure_filename(file.filename)
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                filename = f"post_{timestamp}_{filename}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                post.attachment = filename
        if not title or not content:
            flash('제목과 내용을 모두 입력하세요.', 'error')
            return render_template('community_form.html', post=post)
        post.title = title
        post.content = content
        post.category = category
        db.session.commit()
        flash('게시글이 수정되었습니다.', 'success')
        return redirect(url_for('community_detail', post_id=post.id))
    categories = [r[0] for r in db.session.query(Post.category).distinct().all() if r[0]]
    return render_template('community_form.html', post=post, categories=categories)
# 댓글 삭제 라우트
@app.route('/community/<int:post_id>/comment/<int:comment_id>/delete', methods=['POST'])
@login_required
def delete_post_comment(post_id, comment_id):
    comment = PostComment.query.get_or_404(comment_id)
    if comment.user_id != current_user.id:
        flash('댓글 삭제 권한이 없습니다.', 'error')
        return redirect(url_for('community_detail', post_id=post_id))
    db.session.delete(comment)
    db.session.commit()
    flash('댓글이 삭제되었습니다.', 'success')
    return redirect(url_for('community_detail', post_id=post_id))

@app.route('/community/<int:post_id>/delete', methods=['POST'])
@login_required
def community_delete(post_id):
    post = Post.query.get_or_404(post_id)
    if post.user_id != current_user.id:
        flash('삭제 권한이 없습니다.', 'error')
        return redirect(url_for('community_detail', post_id=post_id))
    db.session.delete(post)
    db.session.commit()
    flash('게시글이 삭제되었습니다.', 'success')
    return redirect(url_for('community_list'))

@app.route('/unfollow/<int:user_id>', methods=['POST'])
@login_required
def unfollow_user(user_id):
    user_to_unfollow = User.query.get_or_404(user_id)
    if user_to_unfollow == current_user:
        flash('자기 자신은 언팔로우할 수 없습니다.', 'error')
        return redirect(_safe_referrer(url_for('home')))
    if current_user.is_following(user_to_unfollow):
        current_user.unfollow(user_to_unfollow)
        db.session.commit()
        flash(f'{user_to_unfollow.username}님을 언팔로우했습니다.', 'success')
    else:
        flash('이미 언팔로우 상태입니다.', 'info')
    return redirect(_safe_referrer(url_for('home')))

@app.route('/profile')
@login_required
def profile_page():
    # 사용자가 올린 음악
    uploaded_music = Music.query.filter_by(user_id=current_user.id).order_by(Music.created_at.desc()).all()
    
    # 사용자가 좋아요한 음악
    liked_music = sorted(current_user.liked_music, key=lambda m: m.created_at, reverse=True)
    
    # 사용자가 작성한 리뷰
    user_reviews = Review.query.filter_by(user_id=current_user.id).order_by(Review.created_at.desc()).all()
    
    return render_template('profile.html', 
                           uploaded_music=uploaded_music,
                           liked_music=liked_music,
                           user_reviews=user_reviews)

@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    if 'music' not in request.files:
        flash('❌ 파일을 선택해주세요', 'error')
        return redirect(url_for('upload_page'))
    
    file = request.files['music']
    title = request.form.get('title', '').strip()
    artist = request.form.get('artist', '').strip() or current_user.username
    genre = request.form.get('genre', '기타')
    tags = request.form.get('tags', '').strip()
    is_ai = request.form.get('is_ai') == 'on'
    if is_ai and not artist.startswith('AI '):
        artist = 'AI ' + artist
    
    if not title:
        flash('❌ 음원 제목을 입력해주세요', 'error')
        return redirect(url_for('upload_page'))
    
    if file.filename == '':
        flash('❌ 파일을 선택해주세요', 'error')
        return redirect(url_for('upload_page'))
    
    if file and allowed_file(file.filename):
        original_filename = secure_filename(file.filename)
        name, ext = os.path.splitext(original_filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{name}_{timestamp}{ext}"
        
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        # 앨범 커버 이미지 처리
        image_filename = None
        if 'image' in request.files:
            image = request.files['image']
            if image and image.filename != '' and allowed_image_file(image.filename):
                img_name, img_ext = os.path.splitext(secure_filename(image.filename))
                image_filename = f"cover_{img_name}_{timestamp}{img_ext}"
                image.save(os.path.join(app.config['UPLOAD_FOLDER'], image_filename))
        
        # 데이터베이스에 음원 정보 저장
        new_music = Music(
            title=title,
            artist=artist,
            filename=filename,
            genre=genre,
            image_filename=image_filename,
            user_id=current_user.id,
            is_ai=is_ai,
            tags=tags
        )
        db.session.add(new_music)
        db.session.commit()
        
        flash(f'🎉 "{title}" 업로드 완료!', 'success')
        return redirect(url_for('music_page'))
    
    flash('❌ MP3, WAV, OGG 파일만 업로드 가능합니다', 'error')
    return redirect(url_for('upload_page'))

@app.route('/music')
def music_page():
    genre_filter = request.args.get('genre')
    search_query = request.args.get('q', '').strip()
    tag_filter = request.args.get('tag', '').strip()
    
    query = Music.query
    
    if genre_filter:
        # 국내가요 → 국내가요, 케이팝 모두 포함
        if genre_filter == '국내가요':
            query = query.filter(Music.genre.in_(['국내가요', '케이팝', 'K-POP', 'KPOP']))
        else:
            query = query.filter_by(genre=genre_filter)
    
    if search_query:
        query = query.filter(
            (Music.title.contains(search_query)) | 
            (Music.artist.contains(search_query))
        )
    if tag_filter:
        query = query.filter(Music.tags.contains(tag_filter))
    
    # 페이지네이션: 1페이지당 15개
    page = request.args.get('page', 1, type=int)
    per_page = 15
    pagination = query.order_by(Music.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    music_list = pagination.items

    genres = [r[0] for r in db.session.query(Music.genre).distinct().all() if r[0]]
    playlists = []
    if current_user.is_authenticated:
        playlists = current_user.playlists
    return render_template('music.html', music_list=music_list, genres=genres, current_genre=genre_filter, search_query=search_query, tag_filter=tag_filter, playlists=playlists, pagination=pagination)

# 플레이리스트 생성 API
@app.route('/playlist/create', methods=['POST'])
@login_required
def create_playlist():
    name = request.form.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': '플레이리스트 이름을 입력하세요.'}), 400
    playlist = Playlist(name=name, user_id=current_user.id)
    db.session.add(playlist)
    db.session.commit()
    return jsonify({'success': True, 'message': '플레이리스트가 생성되었습니다.', 'id': playlist.id, 'name': playlist.name})

@app.route('/playlist/add', methods=['POST'])
@login_required
def add_to_playlist():
    playlist_id = request.form.get('playlist_id')
    music_id = request.form.get('music_id')
    playlist = Playlist.query.filter_by(id=playlist_id, user_id=current_user.id).first()
    music = Music.query.get(music_id)
    if not playlist or not music:
        return jsonify({'success': False, 'message': '플레이리스트 또는 음원을 찾을 수 없습니다.'}), 404
    if music not in playlist.musics:
        playlist.musics.append(music)
        db.session.commit()
    return jsonify({'success': True, 'message': '음원이 플레이리스트에 추가되었습니다.'})
@app.route('/music/<int:music_id>')
def music_detail(music_id):
    music = Music.query.get_or_404(music_id)
    return render_template('detail.html', music=music)

@app.route('/music/<int:music_id>/review', methods=['POST'])
@login_required
def add_review(music_id):
    content = request.form.get('content', '').strip()
    if not content:
        flash('리뷰 내용을 입력해주세요', 'error')
        return redirect(url_for('music_detail', music_id=music_id))
    
    review = Review(content=content, user_id=current_user.id, music_id=music_id)
    db.session.add(review)
    db.session.commit()
    # 알림 생성 (음원 업로더에게)
    music = Music.query.get(music_id)
    if music and music.user_id != current_user.id:
        create_notification(
            user_id=music.user_id,
            type='comment',
            message=f'[{current_user.username}]님이 [{music.title}]에 리뷰를 남겼습니다.',
            url=url_for('music_detail', music_id=music_id)
        )
    return redirect(url_for('music_detail', music_id=music_id))

@app.route('/api/music/<int:music_id>/like', methods=['POST'])
@login_required
def like_music(music_id):
    music = Music.query.get_or_404(music_id)
    if current_user in music.liked_by:
        music.liked_by.remove(current_user)
        liked = False
    else:
        music.liked_by.append(current_user)
        liked = True
        # 알림 생성 (음원 업로더에게, 자기 자신 제외)
        if music.user_id != current_user.id:
            create_notification(
                user_id=music.user_id,
                type='like',
                message=f'[{current_user.username}]님이 [{music.title}]을(를) 좋아합니다.',
                url=url_for('music_detail', music_id=music_id)
            )
    db.session.commit()
    return jsonify({'success': True, 'liked': liked, 'count': music.liked_by.count()})

@app.route('/api/logout')
@login_required
def logout():
    logout_user()
    return jsonify({'success': True})

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    # /persistent/uploads 경로에서 파일 제공 (썸네일 포함)
    upload_folder = app.config['UPLOAD_FOLDER']
    # 경로가 절대경로가 아니면 /persistent/uploads로 보정
    if not os.path.isabs(upload_folder):
        upload_folder = os.path.join(BASE_DIR, upload_folder)
    return send_from_directory(upload_folder, filename)
@app.route('/api/musiclist/all')
def get_all_musiclist():
    # 인기음원(음원 목록) 전체 리스트 반환 (연속재생용)
    query = Music.query.order_by(Music.created_at.desc())
    musics = [
        {
            'id': music.id,
            'title': music.title,
            'artist': music.artist,
            'url': url_for('static', filename='uploads/' + music.filename)
        }
        for music in query.all()
    ]
    return jsonify({'success': True, 'musics': musics})

# 플레이리스트의 음원 목록 반환 API (연속재생용)
@app.route('/api/playlist/<int:playlist_id>/musics')
@login_required
def get_playlist_musics(playlist_id):
    playlist = Playlist.query.filter_by(id=playlist_id, user_id=current_user.id).first()
    if not playlist:
        return jsonify({'success': False, 'musics': []}), 404
    musics = [
        {
            'id': music.id,
            'title': music.title,
            'artist': music.artist,
            'url': url_for('static', filename='uploads/' + music.filename)
        }
        for music in playlist.musics
    ]
    return jsonify({'success': True, 'musics': musics})

@app.route('/delete/<filename>', methods=['POST'])
@login_required
def delete_file(filename):
    try:
        music_to_delete = Music.query.filter_by(filename=filename).first()

        if not music_to_delete:
            flash('❌ 해당 음원을 찾을 수 없습니다.', 'error')
            return redirect(url_for('music_page'))

        if music_to_delete.user_id != current_user.id:
            flash('❌ 삭제 권한이 없습니다.', 'error')
            return redirect(url_for('music_page'))

        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if os.path.exists(filepath):
            os.remove(filepath)
        
        db.session.delete(music_to_delete)
        db.session.commit()
        
        flash('🗑️ 음원 삭제 완료', 'success')
    except Exception as e:
        flash(f'❌ 삭제 실패: {str(e)}', 'error')
    
    return redirect(url_for('music_page'))

@app.route('/api/register', methods=['POST'])
def api_register():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': '데이터가 올바르지 않습니다'}), 400
        
        required_fields = ['username', 'email', 'password']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'{field} 필드는 필수입니다'}), 400
        
        if User.query.filter_by(username=data['username']).first():
            return jsonify({'success': False, 'error': '이미 사용중인 아이디입니다'}), 400
        
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'success': False, 'error': '이미 사용중인 이메일입니다'}), 400
        
        user = User(username=data['username'], email=data['email'])
        user.set_password(data['password'])
        
        db.session.add(user)
        db.session.commit()
        
        return jsonify({'success': True, 'message': '회원가입 성공!'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def api_login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': '데이터가 올바르지 않습니다'}), 400
            
        if not data.get('username') or not data.get('password'):
            return jsonify({'success': False, 'error': '아이디와 비밀번호를 입력해주세요'}), 400
        
        user = User.query.filter_by(username=data['username']).first()
        
        if user and user.check_password(data['password']):
            login_user(user)
            return jsonify({'success': True, 'message': '로그인 성공!'})
        
        return jsonify({'success': False, 'error': '아이디 또는 비밀번호가 틀렸습니다'}), 401
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/profile/update', methods=['POST'])
@login_required
def update_profile():
    data = request.get_json()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    if not username or not email:
        return jsonify({'success': False, 'error': '닉네임과 이메일을 모두 입력하세요.'}), 400
    # 이메일 중복 체크
    if User.query.filter(User.email == email, User.id != current_user.id).first():
        return jsonify({'success': False, 'error': '이미 사용 중인 이메일입니다.'}), 400
    # 닉네임 중복 체크
    if User.query.filter(User.username == username, User.id != current_user.id).first():
        return jsonify({'success': False, 'error': '이미 사용 중인 닉네임입니다.'}), 400
    current_user.username = username
    current_user.email = email
    db.session.commit()
    return jsonify({'success': True, 'username': username, 'email': email})

@app.route('/api/profile/change_password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json()
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    confirm_new_password = data.get('confirm_new_password', '')
    if not current_user.check_password(current_password):
        return jsonify({'success': False, 'error': '현재 비밀번호가 올바르지 않습니다.'}), 400
    if not new_password or len(new_password) < 6:
        return jsonify({'success': False, 'error': '새 비밀번호는 6자 이상이어야 합니다.'}), 400
    if new_password != confirm_new_password:
        return jsonify({'success': False, 'error': '새 비밀번호가 일치하지 않습니다.'}), 400
    current_user.set_password(new_password)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/popular')
def popular():
    # 인기 음원 TOP 10 (좋아요 순)
    music_list = (
        Music.query.outerjoin(Music.liked_by)
        .group_by(Music.id)
        .order_by(func.count('likes.user_id').desc(), Music.created_at.desc())
        .limit(10)
        .all()
    )
    return render_template('popular.html', music_list=music_list)


# --- 아티스트 전체보기 및 상세 페이지 라우트 추가 ---
@app.route('/artists')
def artists():
    # 모든 아티스트(유저) 목록을 username 기준으로 정렬
    artist_list = User.query.order_by(User.username).all()
    return render_template('artists.html', artist_list=artist_list)

@app.route('/artist/<artist_name>')
def artist_profile(artist_name):
    # username이 일치하는 유저를 찾음
    artist = User.query.filter_by(username=artist_name).first_or_404()
    # 해당 아티스트가 업로드한 음악 목록
    uploaded_music = Music.query.filter_by(user_id=artist.id).order_by(Music.created_at.desc()).all()
    return render_template('artist_profile.html', artist=artist, uploaded_music=uploaded_music)
if __name__ == '__main__':
    # 필수 폴더 생성
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, 'instance'), exist_ok=True)

    with app.app_context():
        db.create_all()
        # [자동 복구] 데이터베이스에 image_filename 컬럼이 없으면 자동으로 추가
        import sqlite3
        db_path = os.path.join(BASE_DIR, 'soundwave.db')
        if os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute("PRAGMA table_info(music)")
                columns = [info[1] for info in cursor.fetchall()]
                if 'image_filename' not in columns:
                    print("🔧 데이터베이스 업데이트: 'image_filename' 컬럼 추가 중...")
                    cursor.execute("ALTER TABLE music ADD COLUMN image_filename VARCHAR(200)")
                    conn.commit()
                    print("✅ 데이터베이스 업데이트 완료!")
                if 'genre' not in columns:
                    print("🔧 데이터베이스 업데이트: 'genre' 컬럼 추가 중...")
                    cursor.execute("ALTER TABLE music ADD COLUMN genre VARCHAR(50)")
                    conn.commit()
                    print("✅ 'genre' 컬럼 추가 완료!")
                # 좋아요 및 리뷰 테이블 확인 (간단 체크)
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='likes'")
                if not cursor.fetchone():
                    print("🔧 데이터베이스 업데이트: 'likes' 테이블 생성 필요 (재시작 시 자동 생성됨)")
                # SQLAlchemy가 create_all()에서 처리하므로 여기서는 패스
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='review'")
                if not cursor.fetchone():
                    print("🔧 데이터베이스 업데이트: 'review' 테이블 생성 필요 (재시작 시 자동 생성됨)")
                conn.close()
            except Exception as e:
                print(f"⚠️ 데이터베이스 점검 중 알림: {e}")

# --- 팝업 플레이어 라우트 ---
@app.route('/player_popup')
def player_popup():
    return render_template('player_popup.html')
    print("🎵" * 30)
    print("   SoundWave 음원 공유 플랫폼")
    print("🎵" * 30)
    print(f"📁 업로드 폴더: {os.path.abspath(app.config['UPLOAD_FOLDER'])}")
    print(f"📁 데이터베이스: {os.path.abspath('soundwave.db')}")
    print("🌐 서버 주소: http://localhost:5000")
    print("📤 업로드 페이지: http://localhost:5000/upload")
    print("🎧 음원 목록: http://localhost:5000/music")
    print("👤 로그인: http://localhost:5000/login")
    print("📝 회원가입: http://localhost:5000/register")
    print("⚡ 서버 종료: Ctrl + C")
    print("🎵" * 30)
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)

if __name__ == "__main__":
    socketio.run(app, debug=True)