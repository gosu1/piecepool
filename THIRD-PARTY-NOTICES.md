# 서드파티 고지

PiecePool 배포본에 함께 담기는 서드파티 구성요소와 그 라이선스 고지다.
소스만 참조하고 배포본에 담기지 않는 빌드 도구는 여기 적지 않는다.

| 구성요소 | 버전 | 라이선스 | 담기는 자리 |
| -- | -- | -- | -- |
| [pdf-inspector](https://github.com/firecrawl/pdf-inspector) | 1.17.0 | MIT | 실행 파일에 정적 링크 |
| Adobe CMap 자료 (bcmap 168종) | pdf-inspector 1.17.0 동봉본 | BSD 3-Clause | `resources/bcmaps/` 로 앱 번들에 동봉 |

## Adobe CMap 자료 (BSD 3-Clause)

한글·일본어·중국어 PDF가 글자 대응표를 파일 안에 넣지 않고 이름으로만 참조할 때 쓰는 표다
(PIE-74, `docs/20-backend/pdf-extraction.md`). pdf-inspector가 동봉한 것을
`src-tauri/resources/bcmaps/` 에 그대로 담아 배포한다.

BSD 3-Clause는 바이너리 배포 시 저작권 고지를 함께 제공할 것을 요구한다. 원문 고지는
`src-tauri/resources/bcmaps/LICENSE-adobe-bcmaps.txt` 로 앱 번들 안에 같이 들어가며,
아래는 그 사본이다.

```
Copyright 1990-2009 Adobe Systems Incorporated.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice,
this list of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright notice,
this list of conditions and the following disclaimer in the documentation
and/or other materials provided with the distribution.

Neither the name of Adobe Systems Incorporated nor the names of its
contributors may be used to endorse or promote products derived from this
software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

## pdf-inspector (MIT)

라이선스 전문은 crates.io 배포본과 [저장소](https://github.com/firecrawl/pdf-inspector/blob/main/LICENSE)에 있다.
