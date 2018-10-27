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
        currentChainSkillBases,
        cooldowns;

	mod.hook('S_LOGIN', defs['S_LOGIN'], e => {
		({ gameId, templateId } = e);
		race = Math.floor((templateId - 10101) / 100);
		job = (templateId - 10101) % 100;
        currentAction = null;
        lastAction = null;
        currentChainSkillBases = null;
        initCDs(allSkills[job]);
        //console.log(`[training-wheel] race: ${race} job: ${job} templateId: ${templateId}`);
    });

    mod.hook('S_START_COOLTIME_SKILL', defs['S_START_COOLTIME_SKILL'], e => {
        let id = skillBase(e.skill.id);
        cooldowns[id] = Date.now() + e.cooldown;
        //console.log(`${id} on cd ${cooldowns[id]}`);
    });

    mod.hook('S_DECREASE_COOLTIME_SKILL', defs['S_DECREASE_COOLTIME_SKILL'], e => {
        let id = skillBase(e.skill.id);
        cooldowns[skillBase(id)] -= e.cooldown;
    });

    mod.hook('S_ACTION_STAGE', defs['S_ACTION_STAGE'], {order: -9999}, e => {
		if (!isMe(e.gameId)) return;
        currentAction = e.skill.id;
        edgePredict(e.skill.id);
        evalChains();
    });

    mod.hook('S_ACTION_END', defs['S_ACTION_END'], {order: -9999}, e => {
		if (!isMe(e.gameId)) return;
        lastAction = e.skill.id;
        if(lastAction == currentAction) {
            currentAction = null;
        }
        //evalChains();
    });

    mod.hook('S_PLAYER_STAT_UPDATE', defs['S_PLAYER_STAT_UPDATE'], {order: -9999}, e => {
        edge = e.edge;
    });

    mod.hook('S_ABNORMALITY_END', defs['S_ABNORMALITY_END'], e => {
        if (!isMe(e.target)) return;
    });

    for (let pkt of ['S_ABNORMALITY_BEGIN', 'S_ABNORMALITY_REFRESH']) {
        mod.hook(pkt, defs[pkt], e => {
            if (!isMe(e.target)) return;
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
        if(skillObj && skillObj['*'] && skillObj['*'].edgeMod) {
            edgeMod = skillObj['*'].edgeMod['*'];
            if(skillObj[sub] && skillObj[sub].edgeMod) {
                edgeMod = skillObj[sub].edgeMod['*'];
            }
        }
        edge += edgeMod;
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
        if (currentChainSkillBases && currentChainSkillBases.length) {
            if (currentAction == currentChainSkillBases[0]) {
                currentChainSkillBases = currentChainSkillBases.splice(1); // remove first skill
                let cd = false;
                for (let s of currentChainSkillBases) {
                    if (isOnCd(s, 0)) {
                        return false;
                    }
                }
                if (!cd && currentChainSkillBases.length) {
                    //showSkillsIcons(currentChainSkillBases);
                    return true;
                }
            }
        }
        return false;
    }

    function getSkillBaseFromText(txt) {
        for (let k of Object.keys(allSkills[job])) {
            if (allSkills[job][k]['*'].name == txt) {
                return k;
            }
        }
    }

    function evalChains() {
        console.log(`[training-wheel] currentAction: ${currentAction}`);
        if (job !== 0) return; // only warr
        let bestChain = null;
        
        // check if we should just continue with current chain
        if(executeCurrentChain()) {
            return;
        }

        // find a new chain to show
        for (let chain of chains) {
            if (edge == chain.edge) {
                let cd = false;
                for (let s of chain.skills) {
                    let base = getSkillBaseFromText(s);
                    if (isOnCd(base, 0)) {
                        cd = true;
                        break;
                    }
                }
                if(cd == false) {
                    bestChain = chain;
                    break;
                }
            }
            if (chain.edge == null) {
                let cd = false;
                for (let s of chain.skills) {
                    let base = getSkillBaseFromText(s);
                    if (isOnCd(base, 0)) {
                        cd = true;
                        break;
                    }
                }
                if(cd == false) {
                    bestChain = chain;
                    break;
                }
            }
            if (edge > chain.edge) {
                let cd = false;
                for (let s of chain.skills) {
                    let base = getSkillBaseFromText(s);
                    if (isOnCd(base, 0)) {
                        cd = true;
                        break;
                    }
                }
                if(cd == false) {
                    bestChain = chain;
                    break;
                }
            }
        }
        if (bestChain) {
            currentChainSkillBases = [];
            for (let s of bestChain.skills) {
                currentChainSkillBases.push(getSkillBaseFromText(s));
            }
            showSkillsIcons(currentChainSkillBases);
        }
    }

    function showSkillsIcons(bases) {
        const count = bases.length;
        let msg = '';
        for (let i = 0; i < count; i++) {
            let id = bases[i] * 10000 + 100;
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
