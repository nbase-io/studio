const { notarize } = require('@electron/notarize');
const { build } = require('../package.json');

exports.default = async function notarizing(context) {
  // 개발 중에는 공증 건너뛰기
  if (process.env.NODE_ENV !== 'production') return;
  // macOS에서만 실행
  if (process.platform !== 'darwin') return;

  console.log('앱 공증 중...');

  const appPath = context.appOutDir + `/${build.productName}.app`;

  // APPLE_ID와 APPLE_APP_SPECIFIC_PASSWORD 환경 변수가 설정되어 있는지 확인
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.warn('경고: APPLE_ID 또는 APPLE_APP_SPECIFIC_PASSWORD 환경 변수가 설정되지 않았습니다. 공증을 건너뜁니다.');
    return;
  }

  try {
    // 공증 수행
    await notarize({
      appPath,
      appBundleId: build.appId,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    });
    console.log('앱 공증 완료');
  } catch (error) {
    console.error('앱 공증 실패:', error);
    throw error;
  }
};
