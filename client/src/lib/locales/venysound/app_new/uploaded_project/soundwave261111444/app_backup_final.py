# -*- coding: utf-8 -*-
from flask import Flask, render_template, request, redirect, flash, url_for, send_from_directory, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from datetime import datetime
import os


app = Flask(__name__)
app.secret_key = 'soundwave-secret-key-2024'

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///soundwave.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB
app.config['ALLOWED_EXTENSIONS'] = {'mp3', 'wav', 'ogg'}
db = SQLAlchemy(app)


login_manager = LoginManager(app)
login_manager.login_view = 'login_page'
login_manager.login_message = '로그인이 필요합니다'


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def __repr__(self):
        return f'<User {self.username}>'

class Music(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    artist = db.Column(db.String(100), nullable=False)
    filename = db.Column(db.String(200), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    play_count = db.Column(db.Integer, default=0)
    
    def __repr__(self):
        return f'<Music {self.title}>'

# 로그인 관리자 설정
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ========== 유틸리티 함수 ==========
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def get_music_list():
    """음원 목록 가져오기"""
    return Music.query.order_by(Music.created_at.desc()).all()

# ========== 페이지 라우트 ==========
@app.route('/')
def home():
    """홈페이지"""
    recent_music = Music.query.order_by(Music.created_at.desc()).limit(5).all()
    return render_template('index.html', recent_music=recent_music, total_count=Music.query.count())

@app.route('/upload')
def upload_page():
    """업로드 페이지"""
    return render_template('upload.html')

@app.route('/music')
def music_page():
    """음원 목록 페이지"""
    music_list = get_music_list()
    return render_template('music.html', music_list=music_list)

@app.route('/login')
def login_page():
    """로그인 페이지"""
    return render_template('login.html')

@app.route('/register')
def register_page():
    """회원가입 페이지"""
    return render_template('register.html')

# ========== API 라우트 ==========
@app.route('/api/register', methods=['POST'])
def api_register():
    """회원가입 API"""
    try:
        data = request.get_json()
        
        # 필수 필드 확인
        required_fields = ['username', 'email', 'password']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'{field} 필드는 필수입니다'}), 400
        
        # 중복 확인
        if User.query.filter_by(username=data['username']).first():
            return jsonify({'success': False, 'error': '이미 사용중인 아이디입니다'}), 400
        
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'success': False, 'error': '이미 사용중인 이메일입니다'}), 400
        
        # 사용자 생성
        user = User(username=data['username'], email=data['email'])
        user.set_password(data['password'])
        
        db.session.add(user)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': '회원가입 성공!',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email
            }
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def api_login():
    """로그인 API"""
    try:
        data = request.get_json()
        
        # 필수 필드 확인
        if not data.get('username') or not data.get('password'):
            return jsonify({'success': False, 'error': '아이디와 비밀번호를 입력해주세요'}), 400
        
        # 사용자 찾기
        user = User.query.filter_by(username=data['username']).first()
        
        # 사용자 확인 및 비밀번호 검증
        if user and user.check_password(data['password']):
            login_user(user, remember=data.get('remember', False))
            
            return jsonify({
                'success': True,
                'message': '로그인 성공!',
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email
                }
            })
        
        return jsonify({'success': False, 'error': '아이디 또는 비밀번호가 틀렸습니다'}), 401
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/logout')
@login_required
def api_logout():
    """로그아웃 API"""
    logout_user()
    return jsonify({'success': True, 'message': '로그아웃 되었습니다'})

@app.route('/api/me')
def api_get_current_user():
    """현재 로그인된 사용자 정보"""
    if current_user.is_authenticated:
        return jsonify({
            'success': True,
            'user': {
                'id': current_user.id,
                'username': current_user.username,
                'email': current_user.email
            }
        })
    
    return jsonify({'success': False, 'user': None})

@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    """음원 업로드 처리"""
    if 'music' not in request.files:
        flash('파일을 선택해주세요', 'error')
        return redirect(url_for('upload_page'))
    
    file = request.files['music']
    title = request.form.get('title', '').strip()
    artist = request.form.get('artist', current_user.username if current_user.is_authenticated else '알 수 없음').strip()
    
    if not title:
        flash('음원 제목을 입력해주세요', 'error')
        return redirect(url_for('upload_page'))
    
    if file.filename == '':
        flash('파일을 선택해주세요', 'error')
        return redirect(url_for('upload_page'))
    
    if file and allowed_file(file.filename):
        # 안전한 파일명 생성
        original_filename = secure_filename(file.filename)
        name, ext = os.path.splitext(original_filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{name}_{timestamp}{ext}"
        
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # 음원 정보 저장
        music = Music(
            title=title,
            artist=artist,
            filename=filename,
            user_id=current_user.id if current_user.is_authenticated else None
        )
        
        db.session.add(music)
        db.session.commit()
        
        flash(f'"{title}" 업로드 성공!', 'success')
        return redirect(url_for('music_page'))
    
    flash('MP3, WAV, OGG 파일만 업로드 가능합니다', 'error')
    return redirect(url_for('upload_page'))

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    """업로드된 파일 서빙"""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/music')
def api_get_music():
    """음원 목록 API"""
    music_list = get_music_list()
    return jsonify({
        'success': True,
        'music': [
            {
                'id': m.id,
                'title': m.title,
                'artist': m.artist,
                'filename': m.filename,
                'created_at': m.created_at.isoformat(),
                'url': url_for('uploaded_file', filename=m.filename)
            }
            for m in music_list
        ]
    })

# ========== 메인 실행 ==========
if __name__ == '__main__':
    # 필요한 폴더 생성
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
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
    
    app.run(debug=True, host='0.0.0.0', port=5000)