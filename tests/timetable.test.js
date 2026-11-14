import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/views/assets/public/timetable.js',import.meta.url),'utf8');
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function setup() {
  const element=()=>({children:[],textContent:'',innerHTML:'',appendChild(child){this.children.push(child);},replaceChildren(){this.children=[];},setAttribute(key,value){this[key]=value;},addEventListener(event,handler){this[event]=handler;}});
  const elements=Object.fromEntries([...days,'timetableStatus'].map(day=>[day,element()]));
  const context={document:{getElementById:id=>elements[id],createElement:element,addEventListener(){},currentScript:null},Intl,Date};
  vm.createContext(context);vm.runInContext(source,context);
  return {context,elements};
}

test('admin and member timetables exclude history, order by date and retain upcoming bookings',()=>{
  for(const role of ['admin','member']) {
    const {context,elements}=setup();
    const sessions=[
      {id:1,day:'Monday',time:'06:00',starts_at:'2099-01-12T04:00:00Z',class_name:'Later class',is_paid:false},
      {id:2,day:'Monday',time:'18:00',starts_at:'2099-01-05T16:00:00Z',class_name:'Earlier class',is_paid:true,price:'25'},
      {id:3,day:'Monday',time:'09:00',starts_at:'2020-01-06T07:00:00Z',ends_at:'2020-01-06T08:00:00Z',has_started:true,class_name:'Past <class>',is_paid:true}
    ];
    context.renderTimetable(sessions,role);
    const slots=elements.Monday.children;
    assert.equal(slots.length,2);
    assert.match(slots[0].innerHTML,/Earlier class/);assert.match(slots[1].innerHTML,/Later class/);
    assert.equal(slots[0].innerHTML.includes('Reserve place'),role==='member');assert.equal(slots[1].innerHTML.includes('Join free'),role==='member');
    assert.equal(elements.Tuesday.children[0].textContent,'No sessions scheduled.');
  }
});

test('timetable reports load errors with retry and distinguishes an empty schedule',async()=>{
  const {context,elements}=setup();let failure=true;
  context.fetch=async()=>({ok:!failure,status:failure?503:200,json:async()=>[]});
  await context.refreshTimetable('member');
  assert.equal(elements.timetableStatus.role,'alert');assert.match(elements.timetableStatus.textContent,/Could not load sessions/);
  const retry=elements.timetableStatus.children[0];assert.equal(retry.textContent,'Retry');
  failure=false;await retry.click();assert.equal(elements.timetableStatus.role,'status');assert.equal(elements.timetableStatus.textContent,'No sessions scheduled yet.');
});
