//转工管群成绩可视化插件
//转工管群ISGSNSG 一定要达到和超过转群先进水平

// ==========================================
// 1. 核心配置
// ==========================================
const CONFIG = {
    tableId: 'tableqb-index-table', 
    colIndex: {
        semester: 0,   // 学期
        name: 1,       // 课程名
        credit: 3,     // 学分
        courseType: 4, // 课程性质
        score: 5,       // 总成绩
        note: 6        // 备注
    },

    graduationGoal: 150,
    checkInterval: 2000 
};

let lastDataFingerprint = '';
let scoreChart = null;
let creditChart = null;

// 解析学期文本为可排序的结构（将“暑期”视为第2学期）
function parseSemester(text) {
    if (!text) return null;
    const yearMatch = text.match(/(\d{4})\s*-\s*(\d{4})/);
    const y1 = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const y2 = yearMatch ? parseInt(yearMatch[2], 10) : null;
    let term = 1;
    if (/第\s*2\s*学期/.test(text) || /暑期/.test(text)) term = 2;
    else if (/第\s*1\s*学期/.test(text)) term = 1;
    const label = (y1 && y2) ? `${y1}-${y2} 第${term}学期` : (text.includes('暑期') ? text.replace('暑期', '第2学期') : text);
    const orderKey = (y1 ? y1 : 0) * 10 + term;
    return { label, orderKey, yearStart: y1 || 0, term };
}

// ==========================================
// 2. 数据提取
// ==========================================
function extractData() {
    const table = document.getElementById(CONFIG.tableId);
    if (!table) return null;

    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 2) return null;

    const parsedData = [];

    rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        
        if (cells.length > CONFIG.colIndex.score) {
            const semester = cells[CONFIG.colIndex.semester]?.innerText.trim();
            const name = cells[CONFIG.colIndex.name]?.innerText.trim();
            const scoreText = cells[CONFIG.colIndex.score]?.innerText.trim();
            const creditText = cells[CONFIG.colIndex.credit]?.innerText.trim();
            const typeText = cells[CONFIG.colIndex.courseType]?.innerText.trim() || "其他";
            const noteText = cells[CONFIG.colIndex.note]?.innerText.trim();

            const credit = parseFloat(creditText);

            if (!name || !scoreText || isNaN(credit)) return;

            // --- 关键修改：判定是否拿到学分 ---
            let isEarned = false;
            let scoreVal = 0;
            let dataType = 'unknown'; // 'numeric' | 'pass' | 'fail'

            if (scoreText.includes('未通过') || scoreText.includes('缺考')) {
                dataType = 'fail';
                isEarned = false;
            } 
            else if (scoreText.includes('通过')) {
                dataType = 'pass';
                isEarned = true;
            }
            // 2. 数值判定
            else if (!isNaN(parseFloat(scoreText))) {
                scoreVal = parseFloat(scoreText);
                dataType = 'numeric';
                isEarned = scoreVal >= 60;
            }

            parsedData.push({
                semester: semester,
                name: name,
                score: scoreVal,
                credit: credit,
                courseType: typeText,
                dataType: dataType,
                isEarned: isEarned,
                note: noteText
            });
        }
    });

    return parsedData;
}

// ==========================================
// 3. 统计逻辑
// ==========================================
function calculateStats(data) {
    let stats = {
        all: { weightedSum: 0, credit: 0 },
        degree: { weightedSum: 0, credit: 0 },
        creditDist: {},
        totalEarned: 0,
        semestersAll: {},
        semestersDegree: {}
    };

    const degreeRegex = /通修|平台|核心/;

    data.forEach(item => {
        if (item.note === "无效") return;

        // 只有拿到学分的课，才统计进“分布”和“总学分”
        if (item.isEarned) {
            stats.totalEarned += item.credit;

            // 累计分类学分
            if (!stats.creditDist[item.courseType]) {
                stats.creditDist[item.courseType] = 0;
            }
            stats.creditDist[item.courseType] += item.credit;
        }

        // 计算 GPA 与学期聚合
        if (item.dataType === 'numeric') {
            stats.all.weightedSum += item.score * item.credit;
            stats.all.credit += item.credit;

            if (degreeRegex.test(item.courseType)) {
                stats.degree.weightedSum += item.score * item.credit;
                stats.degree.credit += item.credit;
            }

            const semInfo = parseSemester(item.semester);
            if (semInfo) {
                const key = semInfo.orderKey;
                if (!stats.semestersAll[key]) {
                    stats.semestersAll[key] = { label: semInfo.label, weightedSum: 0, credit: 0 };
                }
                stats.semestersAll[key].weightedSum += item.score * item.credit;
                stats.semestersAll[key].credit += item.credit;

                if (degreeRegex.test(item.courseType)) {
                    if (!stats.semestersDegree[key]) {
                        stats.semestersDegree[key] = { label: semInfo.label, weightedSum: 0, credit: 0 };
                    }
                    stats.semestersDegree[key].weightedSum += item.score * item.credit;
                    stats.semestersDegree[key].credit += item.credit;
                }
            }
        }
    });

    const calcGpa = (wSum, cred) => cred === 0 ? "0.00" : ((wSum / cred) / 20).toFixed(4);
    const calcAvg = (wSum, cred) => cred === 0 ? "0.00" : (wSum / cred).toFixed(4);

    // 生成学期趋势数据（综合与学位）
    const sortedKeys = Array.from(new Set([
        ...Object.keys(stats.semestersAll).map(k => parseInt(k, 10)),
        ...Object.keys(stats.semestersDegree).map(k => parseInt(k, 10))
    ])).sort((a, b) => a - b);

    const labels = sortedKeys.map(k => (stats.semestersAll[k] || stats.semestersDegree[k]).label);
    const allGpaTerm = sortedKeys.map(k => {
        const s = stats.semestersAll[k];
        return s ? calcGpa(s.weightedSum, s.credit) : "0.00";
    });
    const degreeGpaTerm = sortedKeys.map(k => {
        const s = stats.semestersDegree[k];
        return s ? calcGpa(s.weightedSum, s.credit) : "0.00";
    });

    let cumAllWS = 0, cumAllCred = 0, cumDegWS = 0, cumDegCred = 0;
    const allGpaCum = sortedKeys.map(k => {
        const s = stats.semestersAll[k];
        if (s) { cumAllWS += s.weightedSum; cumAllCred += s.credit; }
        return calcGpa(cumAllWS, cumAllCred);
    });
    const degreeGpaCum = sortedKeys.map(k => {
        const s = stats.semestersDegree[k];
        if (s) { cumDegWS += s.weightedSum; cumDegCred += s.credit; }
        return calcGpa(cumDegWS, cumDegCred);
    });

    return {
        totalEarned: stats.totalEarned,
        allGPA: calcGpa(stats.all.weightedSum, stats.all.credit),
        allAvg: calcAvg(stats.all.weightedSum, stats.all.credit),
        degreeGPA: calcGpa(stats.degree.weightedSum, stats.degree.credit),
        creditDistribution: stats.creditDist,
        semesterTrend: { 
            labels, 
            term: { allGpa: allGpaTerm, degreeGpa: degreeGpaTerm },
            cumulative: { allGpa: allGpaCum, degreeGpa: degreeGpaCum }
        }
    };
}

// ==========================================
// 4. 界面渲染 (全新布局)
// ==========================================
function updateDashboard(data) {
    const stats = calculateStats(data);
    const panelId = 'grade-analysis-panel';
    let panel = document.getElementById(panelId);

    if (!panel) {
        panel = document.createElement('div');
        panel.id = panelId;
        panel.style.cssText = `
            position: relative; width: 100%; height: 320px;
            background: #fff; border-bottom: 1px solid #ddd;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05); z-index: 999999;
            padding: 15px 30px; box-sizing: border-box;
            display: flex; flex-direction: column;
            font-family: 'Segoe UI', sans-serif;
        `;
        document.body.insertBefore(panel, document.body.firstChild);
    } else {
        // 更新现有面板样式以适应新布局
        panel.style.height = '320px';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
    }

    // 生成“学分分类详情”的 HTML 列表（固定顺序 + 颜色与饼图一致 + 字号提升）
    const fixedOrder = ['通修', '平台', '核心', '通识', '选修'];
    const palette = ['#4CAF50', '#2196F3', '#FFC107', '#9C27B0', '#00BCD4'];
    let distHtml = '';
    fixedOrder.forEach((type, idx) => {
        const color = palette[idx % palette.length];
        const score = stats.creditDistribution[type] || 0;
        const containerStyle = type === '通识' 
            ? "display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px; color:#555;"
            : "display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px; color:#555;";
        distHtml += `
            <div style="${containerStyle}">
                <span>${type}</span>
                <span style="font-weight:bold; color:${color}; font-size:15px;">${score}</span>
            </div>
        `;
    });

    panel.innerHTML = `
        <div style="flex: 1; width: 100%; display: flex; align-items: center; min-height: 0;">
            <!-- 左侧：成绩概览 (并排展示) -->
            <div style="flex: 0 0 280px; margin-right: 20px;">
                <h3 style="margin:0 0 15px 0; color:#333; font-size:16px; text-align:center;">成绩概览</h3>
                <div style="display: flex; justify-content: space-between;">
                    <div>
                        <h4 style="font-size:12px; color:#888; text-align:center;">综合学分绩</h4>
                        <div style="font-size:24px; font-weight:bold; color:#2196F3;">${stats.allGPA}</div>
                    </div>
                    <div>
                        <h4 style="font-size:12px; color:#888; text-align:center;">学位课学分绩</h4>
                        <div style="font-size:24px; font-weight:bold; color:#FF9800;">${stats.degreeGPA}</div>
                    </div>
                </div>
            </div>

            <!-- 中间：毕业进度 -->
            <div style="flex: 1; height: 100%; display:flex; flex-direction:column; align-items:center; justify-content:center; border-left:1px solid #eee; border-right:1px solid #eee;">
                <div style="height: 160px; width: 160px; position: relative;">
                    <canvas id="credit-progress-chart"></canvas>
                    <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center;">
                        <div style="font-size:12px; color:#999;">已修 / 总学分</div>
                        <div style="font-size:18px; font-weight:bold; color:#333;">${stats.totalEarned} / ${CONFIG.graduationGoal}</div>
                    </div>
                </div>
                <div style="margin-top:5px; font-size:12px; color:#666;">学分完成进度</div>
            </div>

            <!-- 中右：学分构成 -->
            <div style="flex: 0 0 160px; height: 90%; overflow-y: auto; padding: 0 20px 24px 20px; border-right:1px solid #eee;">
                 <h4 style="margin:0 0 10px 0; font-size:14px; color:#333; text-align:center;">学分构成</h4>
                 <div style="padding-right:5px; padding-bottom:16px;">${distHtml}</div>
            </div>

            <!-- 右侧：GPA 趋势图  -->
            <div style="flex: 1.5; height: 100%; padding-left: 20px; display: flex; flex-direction: column; justify-content: center;">
                 <div style="display:flex; align-items:center; justify-content:flex-end; margin-bottom:8px;">
                    <label style="font-size:12px; color:#666; margin-right:8px;">趋势类型</label>
                    <select id="trend-mode-select" style="font-size:12px; padding:2px 6px;">
                        <option value="term">单学期</option>
                        <option value="cumulative">累计</option>
                    </select>
                 </div>
                 <canvas id="gpa-trend-chart"></canvas>
            </div>
        </div>
        
        <!-- 底部：标语与链接 -->
        <div style="flex: 0 0 30px; width: 100%; display: flex; align-items: center; justify-content: center; border-top: 1px solid #eee; margin-top: 10px; font-size: 12px; color: #999;">
            <span>转工管群ISGSNSG</span>
            <span style="margin: 0 10px;">|</span>
            <span>一定要达到和超过转群先进水平</span>
            <span style="margin: 0 10px;">|</span>
            <a href="http://smewin.yifeizhang.top/SmewinSoftware_GPA.html" style="color: #2196F3; text-decoration: none;">项目介绍</a>
            <span style="margin: 0 10px;">|</span>
            <a href="https://github.com/YifeiZhang0508/SmewinGPAPlug-in" style="color: #2196F3; text-decoration: none;">Github主页</a>
        </div>
        
        <button id="close-btn" style="position:absolute; top:10px; right:10px; border:none; background:none; cursor:pointer; font-size:20px; color:#ccc;">×</button>
    `;

    document.getElementById('close-btn').onclick = () => panel.style.display = 'none';

    // --- 绘图 ---
    renderProgressChart(stats.creditDistribution, stats.totalEarned);
    const modeSelect = document.getElementById('trend-mode-select');
    const initialMode = modeSelect ? modeSelect.value : 'term';
    renderGpaTrendChart(stats.semesterTrend, initialMode);
    if (modeSelect) {
        modeSelect.onchange = () => renderGpaTrendChart(stats.semesterTrend, modeSelect.value);
    }
}

function renderProgressChart(distData, totalEarned) {
    const ctx = document.getElementById('credit-progress-chart');
    if (creditChart) creditChart.destroy();

    const fixedOrder = ['通修', '平台', '核心', '通识', '选修'];
    const labels = fixedOrder.slice();
    const dataValues = fixedOrder.map(k => distData[k] || 0);
    
    const remaining = Math.max(0, CONFIG.graduationGoal - totalEarned);
    
    labels.push('未完成');
    dataValues.push(remaining);

    const baseColors = ['#4CAF50', '#2196F3', '#FFC107', '#9C27B0', '#00BCD4'];
    
    const finalColors = labels.map((label, index) => {
        if (label === '未完成') return '#E0E0E0'; // 灰色
        return baseColors[index % baseColors.length];
    });

    creditChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: finalColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${context.raw} 学分`;
                        }
                    }
                }
            }
        }
    });
}

function renderGpaTrendChart(trendData, mode) {
    const ctx = document.getElementById('gpa-trend-chart');
    if (!ctx) return;
    if (scoreChart) scoreChart.destroy();

    const labels = trendData.labels || [];
    const series = (mode === 'cumulative' ? trendData.cumulative : trendData.term) || { allGpa: [], degreeGpa: [] };
    const allPoints = (series.allGpa || []).map(v => parseFloat(v));
    const degreePoints = (series.degreeGpa || []).map(v => parseFloat(v));

    const merged = allPoints.concat(degreePoints).filter(v => !isNaN(v));
    let minY = merged.length ? Math.min(...merged) : 0;
    let maxY = merged.length ? Math.max(...merged) : 5;
    minY = Math.max(0, Math.floor((minY - 0.2) * 10) / 10);
    maxY = Math.min(5.0, Math.ceil((maxY + 0.2) * 10) / 10);
    if (minY >= maxY) { minY = Math.max(0, maxY - 0.5); }

    scoreChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '综合 GPA',
                    data: allPoints,
                    borderColor: '#2196F3',
                    borderWidth: 2,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#2196F3',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: false,
                    tension: 0
                },
                {
                    label: '学位 GPA',
                    data: degreePoints,
                    borderColor: '#FF9800',
                    borderWidth: 2,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#FF9800',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: false,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true },
                title: { 
                    display: true, 
                    text: '学期 GPA 趋势',
                    font: { size: 14 },
                    color: '#666',
                    padding: { bottom: 10 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || 'GPA';
                            return `${label}: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                y: { 
                    beginAtZero: false, 
                    min: minY,
                    max: maxY,
                    grid: { color: '#f0f0f0' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// ==========================================
// 5-0. 消息监听 (用于重新显示面板)
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "show_panel") {
        const panel = document.getElementById('grade-analysis-panel');
        if (panel) {
            panel.style.display = 'flex';
        } else {
            // 尝试手动触发一次提取
            const currentData = extractData();
            if (currentData && currentData.length > 0) {
                updateDashboard(currentData);
            } else {
                alert("当前页面未检测到成绩数据，请确认是否在成绩查询页面。");
            }
        }
        sendResponse({status: "ok"});
    }
});

// ==========================================
// 5. 启动器
// ==========================================
setInterval(() => {
    const currentData = extractData();
    if (currentData && currentData.length > 0) {
        const currentFingerprint = JSON.stringify(currentData);
        if (currentFingerprint !== lastDataFingerprint) {
            lastDataFingerprint = currentFingerprint;
            updateDashboard(currentData);
        }
    }
}, CONFIG.checkInterval);
