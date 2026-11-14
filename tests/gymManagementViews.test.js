import test from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';

const shell={gym:{name:'Test Gym'},member:{firstname:'Owner',role:'gym_super_admin'},csrf:'session-csrf',canGym:()=>true};
const settings={...shell,activePage:'settings',identity:{sub:'7'},owner:true,staff:[],transfers:[],grants:[],branches:[],notifications:[],plans:[],invoices:[],payments:[],banks:[],bankError:null,setup:{onboarding_status:'not_started',payout_eligible:false},subscription:{status:'trialing',period_end:'2026-12-01',cancel_at_period_end:false},commission:{bps:200,bearer:'subaccount'}};
const financials={...shell,activePage:'financials',totals:{gross_cents:50000,commission_cents:1000,gateway_fee_cents:500,expected_net_cents:48500,unknown_fees:0},exceptions:[]};

for(const [page,locals,url]of [['settings',settings,'/admin/settings'],['financials',financials,'/admin/financials']]){
  test(`Gym ${page} uses the shared navigation, active link and responsive shell`,async()=>{
    const html=await ejs.renderFile(`src/views/admin/${page}.html`,locals);
    const visible=html.replace(/<!--[\s\S]*?-->/g,'');
    assert.match(visible,/<body class="bg-body-bg">/);
    assert.match(visible,/<div class="app-shell">/);
    assert.match(visible,/<aside class="sidebar glass-card">/);
    assert.match(visible,/<main class="content gym-management">/);
    assert.ok(visible.includes(`href="${url}" aria-current="page"`));
    assert.ok(new RegExp(`<a class="nav-pill[^\"]*active[^\"]*" href="${url}"`).test(visible));
    assert.equal((visible.match(/id="toggleSidebar"/g)||[]).length,1);
    assert.equal((visible.match(/id="themeToggle"/g)||[]).length,1);
    assert.equal((visible.match(/src="\/assets\/dashboard\/js\/dashboardShell.js"/g)||[]).length,1);
    assert.ok(visible.includes('bootstrap.bundle.min.js'));
    assert.ok(visible.includes('/assets/dashboard/css/stylesdash.css'));
    assert.ok(!visible.includes('/assets/dashboard/css/platform.css'));
    assert.ok(!visible.includes('/assets/dashboard/css/platform-brand.css'));
    assert.ok(!visible.includes('class="topbar"'));
    assert.ok(!visible.includes('class="management-main"'));
    if(page==='settings'){
      assert.ok(visible.includes('action="/admin/settings/payments"'));
      assert.ok(visible.includes('name="_csrf" value="session-csrf"'));
    }else assert.ok(visible.includes('href="/admin/financials/export.csv"'));
  });
}

test('Staff settings keep navigation without exposing owner forms or restricted reports',async()=>{
  const html=await ejs.renderFile('src/views/admin/settings.html',{...settings,owner:false,canGym:permission=>permission==='checkins.write',member:{firstname:'Reception',role:'gym_receptionist'}});
  assert.ok(html.includes('href="/admin/settings" aria-current="page"'));
  assert.ok(html.includes('href="/admin/admin-kiosk"'));
  assert.ok(!html.includes('href="/admin/financials"'));
  assert.ok(!html.includes('action="/admin/settings/payments"'));
  assert.ok(!html.includes('action="/admin/settings/staff"'));
  assert.ok(html.includes('action="/security/mfa/enroll"'));
});
