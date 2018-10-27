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
        cooldowns;

	mod.hook('S_LOGIN', defs['S_LOGIN'], e => {
		({ gameId, templateId } = e);
		race = Math.floor((templateId - 10101) / 100);
		job = (templateId - 10101) % 100;
        currentAction = null;
        lastAction = null;
        currentChainSkills = null;
        initCDs(allSkills[job]);
        //console.log(`[training-wheel] race: ${race} job: ${job} templateId: ${templateId}`);
    });

    mod.hook('S_START_COOLTIME_SKILL', defs['S_START_COOLTIME_SKILL'], e => {
        let id = skillZeroSub(e.skill.id);
        cooldowns[id] = Date.now() + e.cooldown;
    });

    mod.hook('S_DECREASE_COOLTIME_SKILL', defs['S_DECREASE_COOLTIME_SKILL'], e => {
        let id = skillZeroSub(e.skill.id);
        cooldowns[skillZeroSub(id)] -= e.cooldown;
    });

    mod.hook('S_ACTION_STAGE', defs['S_ACTION_STAGE'], {order: -9999}, e => {
		if (!isMe(e.gameId)) return;
        let id = skillZeroSub(e.skill.id);
        currentAction = skillZeroSub(id);
        edgePredict(e.skill.id);
        evalChains();
    });

    mod.hook('S_ACTION_END', defs['S_ACTION_END'], {order: -9999}, e => {
		if (!isMe(e.gameId)) return;
        lastAction = e.skill.id;
        if(lastAction == currentAction) {
            currentAction = null;
        }
        evalChains();
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
        let edgeMod = 0;
        for(let v of Object.values(allSkills[job])) {
            if(v.edgeMod) {
                edgeMod = v.edgeMod['*'];
                // todo: DG
            }
        }
        edge += edgeMod;
    }

    function isMe(id) {
        return gameId.equals(id);
    }

    function isOnCd(skill, tolerance) {
        let id = skillZeroSub(skill);
        if (cooldowns[id] &&
            (cooldowns[id] - Number(tolerance)) > Date.now()) {
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

    function skillZeroSub(id) {
        return Math.floor(id / 100) * 100;
    }

    function executeCurrentChain() {
        if (currentChainSkills && currentChainSkills.length) {
            if (currentAction == currentChainSkills[0]) {
                currentChainSkills = currentChainSkills.splice(1);
                let cd = false;
                for (let s of currentChainSkills) {
                    if (isOnCd(s, 0)) {
                        cd = true;
                        break;
                    }
                }
                if (!cd && currentChainSkills.length) {
                    showSkillsIcons(currentChainSkills);
                    return true;
                }
            }
        }
        return false;
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
                    let skillid = allSkills[job][s];
                    if (isOnCd(skillid, 0)) {
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
                    let skillid = allSkills[job][s];
                    if (isOnCd(skillid, 0)) {
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
                    let skillid = allSkills[job][s];
                    if (isOnCd(skillid, 0)) {
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
            currentChainSkills = [];
            for (let s of bestChain.skills) {
                currentChainSkills.push(allSkills[job][s]);
            }
            showSkillsIcons(currentChainSkills);
        }
    }

    function showSkillsIcons(skills) {
        const count = skills.length;
        let msg = '';
        for (let i = 0; i < count; i++) {
            msg += `<img src="img://skill__0__${mod.game.me.templateId}__${skills[i]}" width="48" height="48" hspace="${300 - i * 50}" vspace="-400"/>`
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
