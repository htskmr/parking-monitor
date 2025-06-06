const puppeteer = require('puppeteer');

// 設定値
const CONFIG = {
    LOGIN_URL: 'https://tp.parking-s.co.jp/tn200/login.php',
    ALERT_URL: 'https://tp.parking-s.co.jp/tn200/index.php?con=alert',
    USERNAME: process.env.PARKING_USERNAME,
    PASSWORD: process.env.PARKING_PASSWORD,
    DISCORD_WEBHOOK: process.env.DISCORD_WEBHOOK,
    NORMAL_MESSAGE: '現在、アラートは発生しておりません。'
};

// メイン監視関数
async function main() {
    console.log('駐車場監視開始:', new Date().toISOString());
    
    let browser;
    try {
        // Puppeteerブラウザ起動
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // 1. ログイン処理
        console.log('ログイン処理開始');
        await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'networkidle0' });
        
        await page.type('input[name="loginname"]', CONFIG.USERNAME);
        await page.type('input[name="loginpass"]', CONFIG.PASSWORD);
        await page.click('input[type="submit"]');
        
        // ログイン完了まで待機
        await page.waitForNavigation({ waitUntil: 'networkidle0' });
        console.log('ログイン完了');
        
        // 2. アラートページへ移動
        console.log('アラートページへ移動');
        await page.goto(CONFIG.ALERT_URL, { waitUntil: 'networkidle0' });
        
        // 3. アラート状態をチェック
        const alertStatus = await checkAlertStatus(page);
        console.log('アラート状態:', alertStatus);
        
        // 4. アラートがある場合は通知
        if (alertStatus.hasAlert) {
            await sendDiscordNotification(alertStatus.alerts);
            console.log('Discord通知送信完了');
        } else {
            console.log('アラートなし - 正常状態');
        }
        
    } catch (error) {
        console.error('エラー発生:', error);
        await sendErrorNotification(error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// アラート状態チェック関数
async function checkAlertStatus(page) {
    try {
        const tableContent = await page.evaluate(() => {
            const table = document.querySelector('table.jtable');
            if (!table) return null;
            
            const rows = Array.from(table.querySelectorAll('tr'));
            const alerts = [];
            
            for (let i = 1; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                if (cells.length === 1) {
                    return {
                        hasAlert: false,
                        message: cells[0].textContent.trim(),
                        alerts: []
                    };
                } else if (cells.length === 5) {
                    alerts.push({
                        datetime: cells[0].textContent.trim(),
                        device: cells[1].textContent.trim(),
                        type: cells[2].textContent.trim(),
                        alertName: cells[3].textContent.trim(),
                        alertContent: cells[4].textContent.trim()
                    });
                }
            }
            
            return {
                hasAlert: alerts.length > 0,
                alerts: alerts
            };
        });
        
        return tableContent || { hasAlert: false, alerts: [] };
        
    } catch (error) {
        console.error('アラート状態チェックエラー:', error);
        throw error;
    }
}

// Discord通知送信
async function sendDiscordNotification(alerts) {
    try {
        let content = '🚨 **駐車場アラート発生！**\n\n';
        
        alerts.forEach((alert, index) => {
            content += `**【アラート${index + 1}】**\n`;
            content += `📅 日時: ${alert.datetime}\n`;
            content += `🔧 機器: ${alert.device}\n`;
            content += `⚠️ 種別: ${alert.type}\n`;
            content += `📋 名称: ${alert.alertName}\n`;
            content += `📝 内容: ${alert.alertContent}\n\n`;
        });
        
        content += `🕐 確認時刻: ${new Date().toLocaleString('ja-JP')}`;
        
        const response = await fetch(CONFIG.DISCORD_WEBHOOK, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: content,
                embeds: [{
                    title: '🅿️ 駐車場管理システム',
                    url: CONFIG.ALERT_URL,
                    color: 15158332,
                    footer: {
                        text: '駐車場監視システム'
                    }
                }]
            })
        });
        
        if (!response.ok) {
            throw new Error(`Discord通知エラー: ${response.status}`);
        }
        
        console.log('Discord通知送信成功');
        
    } catch (error) {
        console.error('通知送信エラー:', error);
        throw error;
    }
}

// エラー通知
async function sendErrorNotification(errorMessage) {
    if (!CONFIG.DISCORD_WEBHOOK) return;
    
    try {
        await fetch(CONFIG.DISCORD_WEBHOOK, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: `⚠️ **駐車場監視システムエラー**\n\n${errorMessage}\n\n🕐 時刻: ${new Date().toLocaleString('ja-JP')}`
            })
        });
        
    } catch (error) {
        console.error('エラー通知送信失敗:', error);
    }
}

// 実行
main();
