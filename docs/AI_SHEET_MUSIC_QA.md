# AI 악보 자동 추출 — 품질 QA 체크리스트 (3단계)

자동 전사 악보는 **연주용 완성본이 아니라 초안**입니다. 아래 항목으로 곡별로 기록하면, 파이프라인·설정(스템/양자화) 개선 시 비교 기준이 됩니다.

## 사용 방법

- 샘플 **10~20곡**을 고른다 (보컬 위주 팝, 인스트루멘탈, 화음 많은 곡 등 유형을 섞는다).
- 각 곡에 대해 PDF(또는 ZIP)를 받은 뒤 **같은 날·같은 서버 설정**으로만 비교한다.
- 체크는 **예 / 아니오 / 부분** 정도로만 적어도 충분하다.

## 체크 항목

| # | 항목 | 설명 |
|---|------|------|
| 1 | **멜로디 대응** | 들리는 주 멜로디와 악보의 대략적인 음 진행이 비슷한가? |
| 2 | **박자·길이** | 마디 감각이 너무 어긋나지 않는가? (양자화 `AI_SCORE_QUANTIZE=1` 전후 비교 권장) |
| 3 | **화음·베이스** | 코드/베이스가 과도하게 틀리거나 빠져 있는가? |
| 4 | **스템 효과** | `AI_SCORE_STEM_SEP=1` + `no_vocals` vs `vocals` 중 어느 쪽이 이 곡에 나은가? |
| 5 | **편집 난이도** | MuseScore에서 MusicXML을 열어 **5~10분 안에** 쓸 만하게 고칠 수 있을 것 같은가? |
| 6 | **공백·잡음 음표** | 의미 없는 짧은 음표가 과도한가? |

## 기록 템플릿 (복사)

```
곡 ID/제목:
설정: STEM_SEP=  QUANTIZE=  STEM_TARGET=
1 멜로디:
2 박자:
3 화음:
4 스템 비고:
5 편집:
6 잡음:
메모:
```

## 서버 환경 변수 요약

- `AI_SCORE_ENABLED=1` — 파이프라인 켜기  
- `AI_SCORE_STEM_SEP=1` — Demucs 2-stem 후 전사 ( `pip install demucs` )  
- `AI_SCORE_STEM_TARGET=no_vocals|vocals` — 반주 또는 보컬 스템 사용  
- `AI_SCORE_QUANTIZE=1` — MIDI 16분음표 격자 양자화 후 조판  
- `AI_SCORE_DEMUCS_PYTHON=python3` — Demucs용 Python 실행 파일  

## API

- `POST /api/ai-music/score-pdf` body: `{ "clientId": "…", "format": "pdf" | "musicxml" | "zip" }`  
- `GET /api/ai-music/score-pdf/availability` — `stemSeparation`, `quantizeMidi`, `exportFormats` 확인  
