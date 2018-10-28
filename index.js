const { Vec3, SkillID } = require("tera-data-parser").types;
const allSkills = require('./skilldict');
const defs = require('./defs');
const chains = require('./warr-chains');

function trainingwheel(mod) {
    let gameId,
        templateId,
        race,
        job,
        edge,
        currentAction,
        lastAction,
        currentChainSkills,
        cooldowns,
        abnormies;


	mod.hook('S_LOGIN', defs['S_LOGIN'], e => {
		({ gameId, templateId } = e);
		race = Math.floor((templateId - 10101) / 100);
		job = (templateId - 10101) % 100;
        currentAction = null;
        lastAction = null;
        currentChainSkills = null;
        initCDs(allSkills[job]);
        abnormies = {};
        //console.log(`[trainingwheel] race: ${race} job: ${job} templateId: ${templateId}`);
    });

    mod.hook('S_START_COOLTIME_SKILL', defs['S_START_COOLTIME_SKILL'], {order: -999, fake: null}, e => {
        let id = skillBase(e.skill.id);
        cooldowns[id] = Date.now() + e.cooldown;
        //console.log(`[trainingwheel] ${id} on cd ${cooldowns[id]}`);
    });

    mod.hook('S_DECREASE_COOLTIME_SKILL', defs['S_DECREASE_COOLTIME_SKILL'], e => {
        let id = skillBase(e.skill.id);
        cooldowns[skillBase(id)] -= e.cooldown;
    });

    mod.hook('S_ACTION_STAGE', defs['S_ACTION_STAGE'], {order: -9999}, e => {
		if (!isMe(e.gameId)) return;
        currentAction = e.skill.id;
        // remove level
        currentAction = Math.floor(currentAction / 10000) * 10000 + (currentAction % 100);
        edgePredict(e.skill.id);
        evalChains();
    });

    mod.hook('S_ACTION_END', defs['S_ACTION_END'], {order: -9999}, e => {
		if (!isMe(e.gameId)) return;
        lastAction = e.skill.id;
        if(lastAction == currentAction) {
            currentAction = null;
        }
    });

    mod.hook('S_PLAYER_STAT_UPDATE', defs['S_PLAYER_STAT_UPDATE'], {order: -9999}, e => {
        edge = e.edge;
    });

    mod.hook('S_ABNORMALITY_END', defs['S_ABNORMALITY_END'], e => {
        if (!isMe(e.target)) return;
        if(abnormies[e.id]) {
            //console.log(`[trainingwheel] abnormi end ${e.id}`);
            abnormies[e.id] = null;
        }
    });

    for (let pkt of ['S_ABNORMALITY_BEGIN', 'S_ABNORMALITY_REFRESH']) {
        mod.hook(pkt, defs[pkt], e => {
            if (!isMe(e.target)) return;
            //console.log(`[trainingwheel] abnormi beg ${e.id} ${e.duration} ${e.stacks}`);
            abnormies[e.id] = {
                end: Date.now() + e.duration,
                stack: e.stacks,
            };
        });
    }

    /*
    for (let pkt of [
        'C_START_SKILL',
	    'C_START_TARGETED_SKILL',
	    'C_START_COMBO_INSTANT_SKILL',
	    'C_START_INSTANCE_SKILL',
	    'C_START_INSTANCE_SKILL_EX'])
    {
        mod.hook(pkt, defs[pkt], {order: 9999}, e => {
        });
    }
    */




    function edgePredict(skillid)
    {
        const base = skillBase(skillid);
        const sub = skillid % 100;
        let edgeMod = 0;
        let skillObj = allSkills[job][base];

        // skill sub edge mode
        if(skillObj && skillObj[sub] && skillObj[sub].edgeMod) {
            edgeMod = skillObj[sub].edgeMod['*'];
            for(let abnormKey of Object.keys(skillObj[sub].edgeMod)) {
                if(abnormies[abnormKey] && abnormies[abnormKey].end > Date.now()) {
                    edgeMod = skillObj[sub].edgeMod[abnormKey];
                }
            }
        }
        // default edge mod
        else if(skillObj && skillObj['*'] && skillObj['*'].edgeMod) {
            edgeMod = skillObj['*'].edgeMod['*'];
            for(let abnormKey of Object.keys(skillObj['*'].edgeMod)) {
                if(abnormies[abnormKey] && abnormies[abnormKey].end > Date.now()) {
                    edgeMod = skillObj['*'].edgeMod[abnormKey];
                }
            }
        }
        edge += edgeMod;
        if(edge > 10) edge = 10;
    }

    function isMe(id) {
        return gameId.equals(id);
    }

    function isOnCd(base, tolerance) {
        if (cooldowns[base] &&
            (cooldowns[base] - Number(tolerance)) > Date.now()) {
            return true;
        }
        return false;
    }

    function initCDs(skills) {
        cooldowns = {};
        for (let s of Object.keys(skills)) {
            cooldowns[s] = 0;
        }
    }

    function skillBase(id) {
        return Math.floor(id / 10000);
    }

    function executeCurrentChain() {
        let res = false;
        if (currentChainSkills && currentChainSkills.length) {
            const currentBase = Math.floor(currentAction / 10000);
            const currentSub = currentAction % 100;
            const expectBase = Math.floor(currentChainSkills[0] / 10000);
            const expectSub = currentChainSkills[0] % 100;

            if (currentBase == expectBase &&
                currentSub == expectSub)
            {
                currentChainSkills = currentChainSkills.splice(1); // remove first skill
                res = true;
            } else if (currentBase == expectBase &&
                    allSkills[job][expectBase][expectSub])
            {
                // expecting a different sub, so just ignore this one, work 100% half the time :^)
                res = true;
            }
            else if (currentBase == expectBase &&
                allSkills[job][currentBase][currentSub] === undefined)
            {
                // if no sub is defined, count as match
                currentChainSkills = currentChainSkills.splice(1); // remove first skill
                res = true;
            } else {
                // didn't execute chain, go find a new chain
                currentChainSkills = null;
                res = false;
            }
        }
        if (currentChainSkills && currentChainSkills.length == 0) {
            currentChainSkills = null;
        }
        console.log(`[trainingwheel] executed (${res}) current chain   ${currentAction} | ${currentChainSkills}`);
        return res;
    }

    function getSkillFromString(str) {
        let base,
            sub = 0;
        let strBase = str.split('-')[0];
        let strSub = str.split('-')[1];
        if (strSub != null) {
            sub = Number(strSub);
        }

        for (let k of Object.keys(allSkills[job])) {
            if (allSkills[job][k]['*'].name == strBase) {
                base = k;
                break;
            }
        }
        return {base, sub};
    }

    function testChainCds(chain) {
        let cd = false;
        for (let s of chain.skills) {
            let { base, sub } = getSkillFromString(s);
            if (isOnCd(base, 0)) {
                return false;
            }
        }
        return true;
    }

    function evalChains() {
        if (job !== 0) return; // only warr

        executeCurrentChain();

        if (currentChainSkills == null) {
		    setTimeout(() => { findBestChain(); }, 350);
        }
    }

    function findBestChain() {
        if(currentChainSkills) return;
        currentChainSkills = [];

        let bestChain = null;
        let bestIndex = null;
        let bestScore = 0;

        const edgeMatchBonus = 10000;
        const edgeNullBonus = 2000;
        const edgeOverFlowBonus = 1000;
        const orderFactor = 10;

        // find a new chain to show
        for (let i = 0; i < chains.length; i++) {
            let chain = chains[i];
            let score = 0;
            /*
            if (chain.abnorm &&
                abnormies[chain.abnorm] != null &&
                edge == chain.edge)
            {
                if(testChainCds(chain)) {
                    // TODO: score
                }
            }
            */
            if (edge == chain.edge) {
                if(testChainCds(chain)) {
                    score = edgeMatchBonus - (orderFactor * i);
                }
            }
            if (chain.edge == null) {
                if(testChainCds(chain)) {
                    score = 1000 - (100 * i);
                    score = edgeNullBonus - (orderFactor * i);
                }
            }
            if (edge > chain.edge) {
                if(testChainCds(chain)) {
                    score = edgeOverFlowBonus - (orderFactor * i);
                }
            }

            if (score > bestScore) {
                bestChain = chain;
                bestScore = score;
                bestIndex = i;
            }
        }
        if (bestChain) {
            currentChainSkills = [];
            for (let s of bestChain.skills) {
                let { base, sub } = getSkillFromString(s);
                currentChainSkills.push(base * 10000 + sub);
            }

            // find and add finisher for 7 or more edge matched chains
            if (edge >=7 && edge < 10 && bestScore >= 9000) {
                for (let i = 0; i < chains.length; i++) {
                    let chain = chains[i];
                    if(chain.edge == 10 && testChainCds(chain)) {
                        for (let s of chain.skills) {
                            let { base, sub } = getSkillFromString(s);
                            currentChainSkills.push(base * 10000 + sub);
                        }
                        break;
                    }
                }
            }

            console.log(`[trainingwheel] selecting new chain edge: ${edge} -------- [${bestIndex}]${bestChain.skills}`);
            showSkillsIcons(currentChainSkills);

            //executeCurrentChain();
        } else {
            currentChainSkills = null;
        }
    }

    function showSkillsIcons(skillids) {
        const count = skillids.length;
        let msg = '';
        for (let i = 0; i < count; i++) {
            let id = Math.floor(skillids[i] / 10000) * 10000 + 100; // set skill to lvl so there's acutally icon for it
            msg += `<img src="img://skill__0__${mod.game.me.templateId}__${id}" width="48" height="48" hspace="${300 - i * 50}" vspace="-400"/>`
        }
        mod.send('S_DUNGEON_EVENT_MESSAGE', defs['S_DUNGEON_EVENT_MESSAGE'], {
            message: msg,
            type: 2,
            chat: false,
            channel: 0
        });
    }


}

module.exports = trainingwheel;
