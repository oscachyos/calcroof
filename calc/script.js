// calc/script.js
document.addEventListener('DOMContentLoaded', () => {
    // База приложения: папка calc/ (script с id надёжен при любых CDN со «script» в пути)
    const scriptEl = document.getElementById('calc-script')
        || document.querySelector('script[src$="script.js"], script[src*="script.js"]');
    const calcBaseUrl = (scriptEl && scriptEl.src)
        ? new URL('./', scriptEl.src)
        : new URL('./', window.location.href);

    function calcUrl(relativePath) {
        return new URL(relativePath, calcBaseUrl).href;
    }
    function resolveStaticUrl(maybe) {
        if (!maybe) return maybe;
        if (maybe.startsWith('http://') || maybe.startsWith('https://') || maybe.startsWith('data:')) return maybe;
        if (maybe.startsWith('/calc/')) return new URL(maybe.replace(/^\/calc\//, ''), calcBaseUrl).href;
        if (maybe.startsWith('/')) return new URL(maybe, window.location.origin).href;
        return calcUrl(maybe);
    }

    // === PWA SERVICE WORKER ===
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(calcUrl('sw.js'), { scope: calcBaseUrl.href })
            .then((registration) => {
                console.log('Service Worker зарегистрирован:', registration);
            })
            .catch((error) => {
                console.log('Ошибка регистрации Service Worker:', error);
            });
    }
    // === КОНЕЦ PWA ===


    const tabLinks = document.querySelectorAll('.tab-links a');
    const tabContents = document.querySelectorAll('.tab-content');

    // Функция для безопасного парсинга даты (обрабатывает как ISO формат, так и старые локализованные форматы)
    function parseDateSafe(timestamp) {
        if (!timestamp) return new Date();
        // Если это ISO строка, она парсится напрямую
        const parsed = new Date(timestamp);
        // Проверяем, что дата валидна
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
        // Если парсинг не удался, пытаемся как есть или возвращаем текущую дату
        return new Date();
    }

    function uint8ToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
    }

    function base64ToUint8(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    async function deriveAesKeyFromPassword(password, salt) {
        const encoder = new TextEncoder();
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations: 250000,
                hash: 'SHA-256'
            },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptBackupData(data, password) {
        if (!window.isSecureContext || !window.crypto || !window.crypto.subtle) {
            throw new Error('WEB_CRYPTO_UNAVAILABLE');
        }
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveAesKeyFromPassword(password, salt);
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoder.encode(JSON.stringify(data))
        );
        return {
            __encryptedBackup: true,
            version: 1,
            savedAt: new Date().toISOString(),
            kdf: 'PBKDF2',
            iterations: 250000,
            hash: 'SHA-256',
            cipher: 'AES-GCM',
            salt: uint8ToBase64(salt),
            iv: uint8ToBase64(iv),
            data: uint8ToBase64(new Uint8Array(encrypted))
        };
    }

    async function decryptBackupData(payload, password) {
        if (!window.isSecureContext || !window.crypto || !window.crypto.subtle) {
            throw new Error('WEB_CRYPTO_UNAVAILABLE');
        }
        const decoder = new TextDecoder();
        const salt = base64ToUint8(payload.salt);
        const iv = base64ToUint8(payload.iv);
        const encryptedBytes = base64ToUint8(payload.data);
        const key = await deriveAesKeyFromPassword(password, salt);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            encryptedBytes
        );
        return JSON.parse(decoder.decode(decrypted));
    }

    // Скрываем все вкладки
    function hideAllTabs() {
        tabContents.forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
        });
        tabLinks.forEach(link => link.classList.remove('active'));
    }

    // Показываем выбранную вкладку
    function showTab(targetId) {
        console.log('showTab вызвана с targetId:', targetId);
        hideAllTabs();
        const targetContent = document.getElementById(targetId);
        const targetLink = document.querySelector(`a[href="#${targetId}"]`);
        console.log('targetContent:', targetContent);
        console.log('targetLink:', targetLink);
        
        if (targetContent && targetLink) {
            console.log('ПЕРЕД изменениями - display:', targetContent.style.display, 'classList:', targetContent.classList.toString());
            targetContent.classList.add('active');
            targetContent.style.display = 'block';
            console.log('ПОСЛЕ изменений - display:', targetContent.style.display, 'classList:', targetContent.classList.toString());
            targetLink.classList.add('active');
            targetContent.scrollIntoView({ behavior: 'smooth' });
            console.log('Вкладка активирована:', targetId);
            
            // Дополнительная проверка через 200ms
            setTimeout(() => {
                console.log('Проверка через 200ms - display:', targetContent.style.display, 'computed:', window.getComputedStyle(targetContent).display);
            }, 200);
        } else {
            console.warn('Не найден элемент для вкладки:', targetId);
        }
        
        // Логика для floating-menu-btn - показываем только при открытой calc19
        const floatingBtn = document.getElementById('floating-menu-btn');
        if (floatingBtn) {
            floatingBtn.style.display = (targetId === 'calc19') ? 'block' : 'none';
        }
        
        // Обновляем графики и статистику при переключении на вкладку "Анализ работы"
        if (targetId === 'calc-analysis') {
            console.log('Переключение на calc-analysis');
            
            // Проверяем видимость элементов
            const analysisTab = document.getElementById('calc-analysis');
            const computed = window.getComputedStyle(analysisTab);
            console.log('Вкладка calc-analysis:');
            console.log('- offsetWidth:', analysisTab.offsetWidth);
            console.log('- offsetHeight:', analysisTab.offsetHeight);
            console.log('- scrollHeight:', analysisTab.scrollHeight);
            console.log('- children count:', analysisTab.children.length);
            console.log('- computed display:', computed.display);
            console.log('- computed visibility:', computed.visibility);
            console.log('- computed opacity:', computed.opacity);
            console.log('- computed width:', computed.width);
            console.log('- computed height:', computed.height);
            console.log('- computed overflow:', computed.overflow);
            console.log('- родитель:', analysisTab.parentElement?.tagName, analysisTab.parentElement?.className);
            
            setTimeout(() => {
                // renderWorkerStats содержит все функции рендеринга графиков и статистики
                if (typeof window.renderWorkerStats === 'function') {
                    console.log('Вызываем renderWorkerStats');
                    window.renderWorkerStats();
                }
                
                if (typeof window.renderForecast === 'function') {
                    console.log('Вызываем renderForecast');
                    window.renderForecast();
                }
                
                // Проверяем, что отрисовалось
                setTimeout(() => {
                    const topWorker = document.getElementById('top-worker');
                    const forecastIncome = document.getElementById('forecast-income');
                    console.log('После рендеринга:');
                    console.log('- top-worker текст:', topWorker?.textContent);
                    console.log('- forecast-income текст:', forecastIncome?.textContent);
                    console.log('- Высота вкладки:', analysisTab.offsetHeight);
                }, 200);
            }, 100);
        }

        if (targetId === 'calc-settings') {
            renderWorkersSettingsTab();
        }
    }

    // Показываем первую вкладку по умолчанию
    showTab('calc2');

    // Обработка кликов по вкладкам
    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            showTab(targetId);
        });
    });

    // Расход крепежа (прижимная планка)
    window.calculate2 = function() {
        const area = parseFloat(document.getElementById('area2').value) || 0;
        const resultDiv = document.getElementById('result2');
        if (area <= 0) {
            resultDiv.innerText = 'Введите корректное положительное число для площади.';
            resultDiv.classList.remove('active');
            return;
        }
        const railsPerSqM = 0.5; // м рейки на м²
        const railsLength = Math.ceil(area * railsPerSqM);
        const railsCount = Math.ceil(railsLength / 2); // 2 м/рейка
        const mastic = railsLength * 0.5; // 0.5 кг герметика на м
        const masticCartridges = Math.ceil(mastic / 0.31); // картридж 0.31 кг
        const dowels = railsLength * 4; // 4 дюбеля на м
        const tools = 'Инструмент: ножницы по металлу (1 шт), перфоратор (1 шт), молоток (1 шт), пистолет для герметика (1 шт).';
        resultDiv.innerText = `Для ${area} м² потребуется ${railsLength} м прижимной планки (алюминиевая рейка TechnoNICOL, 2 м, ${railsCount} шт). Мастичный герметик: ${mastic.toFixed(2)} кг (${masticCartridges} картриджей, 0.31 кг). Быстрый монтаж: ${dowels} дюбелей (8 мм). ${tools}`;
        resultDiv.classList.add('active');
    };

    // Уклон кровли
    window.calculate4 = function() {
        const length = parseFloat(document.getElementById('length4').value) || 0;
        const height = parseFloat(document.getElementById('height4').value) || 0;
        const resultDiv = document.getElementById('result4');
        if (length <= 0 || height < 0) {
            resultDiv.innerText = 'Введите корректные положительные числа.';
            resultDiv.classList.remove('active');
            return;
        }
        const slope = (height / length) * 100;
        const recommendation = slope >= 1.5 ? 'Подходит для наплавляемой кровли' : 'Уклон слишком мал (мин. 1.5%)';
        resultDiv.innerText = `Уклон кровли: ${slope.toFixed(2)} %. ${recommendation}.`;
        resultDiv.classList.add('active');
    };

    // Время выполнения работ
    window.calculate7 = function() {
        const area = parseFloat(document.getElementById('area7').value) || 0;
        const team = parseFloat(document.getElementById('team7').value) || 1;
        const resultDiv = document.getElementById('result7');
        if (area <= 0 || team <= 0) {
            resultDiv.innerText = 'Введите корректные положительные числа.';
            resultDiv.classList.remove('active');
            return;
        }
        const time = area / (50 * team);
        resultDiv.innerText = `Время: ${time.toFixed(2)} дней.`;
        resultDiv.classList.add('active');
    };

    // Логистика материалов
    window.calculate8 = function() {
        const distance = parseFloat(document.getElementById('distance8').value) || 0;
        const volume = parseFloat(document.getElementById('volume8').value) || 0;
        const resultDiv = document.getElementById('result8');
        if (distance < 0 || volume < 0) {
            resultDiv.innerText = 'Введите корректные положительные числа.';
            resultDiv.classList.remove('active');
            return;
        }
        const cost = distance * 30 + volume * 150;
        resultDiv.innerText = `Стоимость логистики: ${cost.toFixed(2)} руб.`;
        resultDiv.classList.add('active');
    };

    // Расход праймера
    window.calculate11 = function() {
        const primerType = document.getElementById('primerType11').value;
        const baseType = document.getElementById('baseType11').value;
        const calcType = document.getElementById('calcType11').value;
        const inputValue = parseFloat(document.getElementById('area11').value) || 0;
        const resultDiv = document.getElementById('result11');
        if (inputValue <= 0) {
            resultDiv.innerText = 'Введите корректное положительное число.';
            resultDiv.classList.remove('active');
            return;
        }
        let rate, bucketSize;
        switch (primerType) {
            case 'primer01':
                rate = baseType === 'concrete' ? 0.25 : 0.3;
                bucketSize = 16; // кг/ведро (20 л)
                break;
            case 'primer03':
                rate = baseType === 'concrete' ? 0.3 : 0.35;
                bucketSize = 18; // кг/ведро (20 л)
                break;
            case 'primer04':
                rate = baseType === 'concrete' ? 0.3 : 0.35;
                bucketSize = 16; // кг/ведро (20 л)
                break;
            case 'primer08':
                rate = baseType === 'concrete' ? 0.35 : 0.4;
                bucketSize = 8; // кг/ведро (10 л)
                break;
        }
        let result = '';
        const rollers = Math.ceil(inputValue / 100); // 1 валик на 100 м²
        const tools = `Инструмент: валик (180–250 мм, ${rollers} шт), чехлы для валика (${rollers} шт), телескопическая ручка (1 шт). Альтернатива: кисть (1–2 шт) или распылитель (1 шт).`;
        if (calcType === 'areaToMaterial') {
            const requiredKg = inputValue * rate;
            const buckets = Math.ceil(requiredKg / bucketSize);
            result = `Для ${inputValue} м² потребуется около ${requiredKg.toFixed(2)} кг праймера, или ${buckets} ведро(а) (${bucketSize} кг). ${tools}`;
        } else {
            const area = inputValue / rate;
            const buckets = Math.floor(inputValue / bucketSize);
            result = `${inputValue} кг праймера покрывает около ${area.toFixed(2)} м². Это ${buckets} ведро(а) (${bucketSize} кг) с остатком ${inputValue % bucketSize} кг. ${tools}`;
        }
        resultDiv.innerText = result;
        resultDiv.classList.add('active');
    };

    // Расход газовых баллонов
    window.calculate12 = function() {
        const area = parseFloat(document.getElementById('area12').value) || 0;
        const layers = parseFloat(document.getElementById('layers12').value) || 1;
        const resultDiv = document.getElementById('result12');
        if (area <= 0 || layers <= 0) {
            resultDiv.innerText = 'Введите корректные положительные числа.';
            resultDiv.classList.remove('active');
            return;
        }
        const cylinders = Math.ceil((area * layers) / 120);
        const tools = 'Инструмент: газовая горелка (1 шт на бригаду), зажигалка (1 комплект).';
        resultDiv.innerText = `Количество газовых баллонов (12 л): ${cylinders} шт. ${tools}`;
        resultDiv.classList.add('active');
    };

    // Расход мастики
    window.calculate13 = function() {
        const masticType = document.getElementById('masticType13').value;
        const calcType = document.getElementById('calcType13').value;
        const inputValue = parseFloat(document.getElementById('area13').value) || 0;
        const resultDiv = document.getElementById('result13');
        if (inputValue <= 0) {
            resultDiv.innerText = 'Введите корректное положительное число.';
            resultDiv.classList.remove('active');
            return;
        }
        const rate = masticType === 'bitum' ? 1.5 : 2.0;
        const bucketSize = masticType === 'bitum' ? 20 : 18;
        const tools = 'Инструмент: пистолет для герметика (1 шт), шпатель (100 мм, 1–2 шт).';
        let result = '';
        if (calcType === 'areaToMaterial') {
            const requiredKg = inputValue * rate;
            const buckets = Math.ceil(requiredKg / bucketSize);
            result = `Для ${inputValue} м² потребуется около ${requiredKg.toFixed(2)} кг мастики, или ${buckets} ведро(а) (${bucketSize} кг). ${tools}`;
        } else {
            const area = inputValue / rate;
            const buckets = Math.floor(inputValue / bucketSize);
            result = `${inputValue} кг мастики покрывает около ${area.toFixed(2)} м². Это ${buckets} ведро(а) (${bucketSize} кг) с остатком ${inputValue % bucketSize} кг. ${tools}`;
        }
        resultDiv.innerText = result;
        resultDiv.classList.add('active');
    };

    // Аэраторы
    window.calculate15 = function() {
        const calcType = document.getElementById('calcType15').value;
        const inputValue = parseFloat(document.getElementById('inputValue15').value) || 0;
        const resultDiv = document.getElementById('result15');
        if (inputValue <= 0) {
            resultDiv.innerText = 'Введите корректное положительное число.';
            resultDiv.classList.remove('active');
            return;
        }
        const aeratorsPerArea = 100;
        const minAerators = 2;
        const maxDistance = 15;
        const sealantRate = 0.1; // 0.1 кг герметика на аэратор
        const sealantCartridge = 0.31; // картридж 0.31 кг
        const tools = 'Инструмент: нож для кровли (100 мм, 1 шт), пистолет для герметика (1 шт).';
        let result = '';
        if (calcType === 'areaToMaterial') {
            const aerators = Math.max(minAerators, Math.ceil(inputValue / aeratorsPerArea));
            const sideLength = Math.sqrt(inputValue);
            const interval = Math.min(maxDistance, sideLength / Math.ceil(Math.sqrt(aerators)));
            const sealant = aerators * sealantRate;
            const cartridges = Math.ceil(sealant / sealantCartridge);
            result = `Для ${inputValue} м² потребуется около ${aerators} аэраторов ТАТПОЛИМЕР ТП-01.100/6. Интервал: до ${interval.toFixed(2)} м. Герметик: ${sealant.toFixed(2)} кг (${cartridges} картриджей, 0.31 кг). ${tools}`;
        } else {
            const area = inputValue * aeratorsPerArea;
            const sealant = inputValue * sealantRate;
            const cartridges = Math.ceil(sealant / sealantCartridge);
            result = `${inputValue} аэраторов ТАТПОЛИМЕР ТП-01.100/6 покрывает около ${area.toFixed(2)} м². Герметик: ${sealant.toFixed(2)} кг (${cartridges} картриджей, 0.31 кг). ${tools}`;
        }
        resultDiv.innerText = result;
        resultDiv.classList.add('active');
    };

    // Минвата
    window.calculate16 = function() {
        const material = document.getElementById('material16').value;
        const calcType = document.getElementById('calcType16').value;
        const inputValue = parseFloat(document.getElementById('inputValue16').value) || 0;
        const resultDiv = document.getElementById('result16');
        if (inputValue <= 0) {
            resultDiv.innerText = 'Введите корректное положительное число.';
            resultDiv.classList.remove('active');
            return;
        }
        let areaPerPack, materialName;
        switch (material) {
            case 'minwool_technoacoustic':
                areaPerPack = 5.76;
                materialName = 'Минвата Техноакустик, 50 мм';
                break;
            case 'minwool_technoroof':
                areaPerPack = 2.88;
                materialName = 'Минвата Техноруф В60, 50 мм';
                break;
            case 'minwool_ozm':
                areaPerPack = 4.32;
                materialName = 'Минвата Техно ОЗМ, 30 мм';
                break;
        }
        const glueRate = 0.5; // 0.5 кг клея на м²
        const glueBucket = 25; // ведро 25 кг
        const tools = 'Инструмент: нож для резки минваты (200 мм, 1 шт), зубчатый шпатель (6–8 мм, 1 шт).';
        let result = '';
        if (calcType === 'areaToMaterial') {
            const packs = Math.ceil(inputValue / areaPerPack);
            const glue = inputValue * glueRate;
            const buckets = Math.ceil(glue / glueBucket);
            result = `Для ${inputValue} м² потребуется около ${packs} упаковок (${materialName}, ${areaPerPack} м²/уп.). Клей: ${glue.toFixed(2)} кг (${buckets} ведер, 25 кг). ${tools}`;
        } else {
            const area = inputValue * areaPerPack;
            const glue = area * glueRate;
            const buckets = Math.ceil(glue / glueBucket);
            result = `${inputValue} упаковок (${materialName}, ${areaPerPack} м²/уп.) покрывает около ${area.toFixed(2)} м². Клей: ${glue.toFixed(2)} кг (${buckets} ведер, 25 кг). ${tools}`;
        }
        resultDiv.innerText = result;
        resultDiv.classList.add('active');
    };

    // PIR-плиты
    window.calculate17 = function() {
        const material = document.getElementById('material17').value;
        const calcType = document.getElementById('calcType17').value;
        const inputValue = parseFloat(document.getElementById('inputValue17').value) || 0;
        const resultDiv = document.getElementById('result17');
        if (inputValue <= 0) {
            resultDiv.innerText = 'Введите корректное положительное число.';
            resultDiv.classList.remove('active');
            return;
        }
        let areaPerPlate, materialName;
        switch (material) {
            case 'pir_logicpir':
                areaPerPlate = 0.72;
                materialName = 'PIR-плиты LOGICPIR, 50 мм';
                break;
            case 'pir_logicpir_prof':
                areaPerPlate = 2.83;
                materialName = 'PIR-плиты LOGICPIR PROF, 90 мм';
                break;
        }
        const foamRate = 0.75; // 0.75 кг пены на м²
        const canSize = 0.75; // банка 0.75 кг
        const tools = 'Инструмент: пистолет для пены (1 шт), нож для резки PIR (200 мм, 1 шт).';
        let result = '';
        if (calcType === 'areaToMaterial') {
            const plates = Math.ceil(inputValue / areaPerPlate);
            const foamKg = inputValue * foamRate;
            const cans = Math.ceil(foamKg / canSize);
            result = `Для ${inputValue} м² потребуется около ${plates} плит (${materialName}, ${areaPerPlate} м²/плита). Пена: ${foamKg.toFixed(2)} кг (${cans} банок, 0.75 кг/банка). ${tools}`;
        } else {
            const area = inputValue * areaPerPlate;
            const foamKg = area * foamRate;
            const cans = Math.ceil(foamKg / canSize);
            result = `${inputValue} плит (${materialName}, ${areaPerPlate} м²/плита) покрывает около ${area.toFixed(2)} м². Пена: ${foamKg.toFixed(2)} кг (${cans} банок, 0.75 кг/банка). ${tools}`;
        }
        resultDiv.innerText = result;
        resultDiv.classList.add('active');
    };

    // PDF-рендеринг и расчет рулонов
    let pdfDoc18 = null;
    let currentPage18 = 1;
    let totalPages18 = 0;

    window.fetchPDFText = async function(url) {
        const pdf = await pdfjsLib.getDocument(url).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            content.items.forEach(item => fullText += item.str + ' ');
        }
        return fullText;
    };

    window.extractRollArea = function(text) {
        const simplified = text.replace(/\s+/g, ' ').toLowerCase();
        const lengthMatch = simplified.match(/длина[^0-9]*?±?\d*%{0,1}\s*(\d+[,.]?\s*\d*)/i);
        const widthMatch = simplified.match(/ширина[^0-9]*?±?\d*%{0,1}\s*(\d+[,.]?\s*\d*)/i);
        if (lengthMatch && widthMatch) {
            const normalize = str => str.replace(/\s+/g, '').replace(',', '.');
            const length = parseFloat(normalize(lengthMatch[1]));
            const width = parseFloat(normalize(widthMatch[1]));
            if (isNaN(length) || isNaN(width) || length <= 0 || width <= 0) {
                throw new Error("Некорректные размеры рулона.");
            }
            return +(length * width).toFixed(2);
        }
        throw new Error("Не удалось определить размеры рулона из PDF.");
    };

    window.calculate18 = async function() {
        const area = parseFloat(document.getElementById('area18').value) || 0;
        const pdfUrl = document.getElementById('material18').value;
        const resultDiv = document.getElementById('result18');
        if (area <= 0) {
            resultDiv.innerText = 'Введите корректное положительное число для площади.';
            resultDiv.classList.remove('active');
            return;
        }
        try {
            const text = await fetchPDFText(pdfUrl);
            const rollArea = await extractRollArea(text);
            const reservePercent = (window.CALC_SETTINGS && Number.isFinite(window.CALC_SETTINGS.rollReservePercent))
                ? window.CALC_SETTINGS.rollReservePercent
                : 15;
            const requiredArea = area * (1 + reservePercent / 100);
            const rollsNeeded = Math.ceil(requiredArea / rollArea);
            const tools = 'Инструмент: газовая горелка (1 шт на бригаду), зажигалка (1 комплект), нож для кровли (100 мм, 1 шт).';
            resultDiv.innerText = `Для ${area} м² потребуется ${rollsNeeded} рулон(ов) (площадь с запасом ${reservePercent}%: ${requiredArea.toFixed(2)} м², площадь одного рулона: ${rollArea} м²). ${tools}`;
            resultDiv.classList.add('active');
        } catch (err) {
            resultDiv.innerText = `Ошибка: ${err.message}`;
            resultDiv.classList.add('active');
        }
    };

    window.renderPDF18 = async function() {
        const url = document.getElementById('material18').value;
        const canvas = document.getElementById('pdf-canvas18');
        const context = canvas.getContext('2d');
        try {
            pdfDoc18 = await pdfjsLib.getDocument(url).promise;
            totalPages18 = pdfDoc18.numPages;
            currentPage18 = 1;
            document.getElementById('page-count18').textContent = totalPages18;
            document.getElementById('pdf-controls18').classList.add('active');
            canvas.classList.add('active');
            await renderPage18(currentPage18);
        } catch (err) {
            alert("Ошибка загрузки PDF: " + err.message);
        }
    };

    window.renderPage18 = async function(pageNum) {
        const canvas = document.getElementById('pdf-canvas18');
        const context = canvas.getContext('2d');
        const page = await pdfDoc18.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.3 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({
            canvasContext: context,
            viewport
        }).promise;
        document.getElementById('page-num18').textContent = pageNum;
    };

    window.prevPage18 = function() {
        if (currentPage18 <= 1) return;
        currentPage18--;
        renderPage18(currentPage18);
    };

    window.nextPage18 = function() {
        if (currentPage18 >= totalPages18) return;
        currentPage18++;
        renderPage18(currentPage18);
    };

    // DOM элементы
    const customServiceForm = document.getElementById('custom-service-form');
    const serviceWorkersCheckboxGroup = document.getElementById('service-workers-checkbox-group');
    const serviceNameInput = customServiceForm.querySelector('input[name="serviceName"]');
    const serviceNameSuggestions = document.getElementById('service-name-suggestions');
    const serviceSelect = customServiceForm.querySelector('#service-select-custom');
    const serviceOptions = customServiceForm.querySelector('#service-options-custom');

    const expenseTypeSelect = document.getElementById('expense-type-select');
    const expenseTypeValue = document.getElementById('expense-type-value');
    const expenseTypeOptions = document.getElementById('expense-type-options');

    const objectForm = document.getElementById('object-form');
    const expenseForm = document.getElementById('expense-form');
    const manualPriceForm = document.getElementById('manual-price-form');
    const selectDisplay = document.getElementById('service-select');
    const selectedValue = document.getElementById('selected-value');
    const optionsList = document.getElementById('service-options');
    const manualSelectDisplay = document.getElementById('manual-service-select');
    const manualSelectedValue = document.getElementById('manual-selected-value');
    const manualOptionsList = document.getElementById('manual-service-options');
    const manualPriceLabel = document.getElementById('manual-price-label');
    const workersCheckboxGroup = document.getElementById('workers-checkbox-group');
    const expenseWorkersCheckboxGroup = document.getElementById('expense-workers-checkbox-group');
    const expenseReceiversCheckboxGroup = document.getElementById('expense-receivers-checkbox-group');
    const manualWorkersCheckboxGroup = document.getElementById('manual-workers-checkbox-group');
    const objectNameInput = objectForm.querySelector('input[name="objectName"]');
    const expenseNameInput = expenseForm.querySelector('input[name="expenseName"]');
    const manualObjectNameInput = manualPriceForm.querySelector('input[name="objectName"]');
    const objectNameSuggestions = document.getElementById('object-name-suggestions');
    const expenseNameSuggestions = document.getElementById('expense-name-suggestions') || document.createElement('ul');
    const manualObjectNameSuggestions = document.getElementById('manual-object-name-suggestions');
    const resultsDiv = document.getElementById('results');
    const workerStatsDiv = document.getElementById('worker-stats');
    const historyModal = document.getElementById('history-modal');
    const closeHistoryBtn = document.getElementById('close-history');
    const historyList = document.getElementById('history-list');
    const filterInput = document.getElementById('object-filter');
    
    // === РАСШИРЕННЫЕ ФИЛЬТРЫ ===
    const toggleFiltersBtn = document.getElementById('toggle-filters');
    const filtersContent = document.querySelector('.filters-content');
    const filterPeriod = document.getElementById('filter-period');
    const customDates = document.querySelectorAll('.custom-dates');
    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    const searchName = document.getElementById('search-name');
    const filterStatus = document.getElementById('filter-status');
    const filterType = document.getElementById('filter-type');
    const filterWorker = document.getElementById('filter-worker');
    const filterSumFrom = document.getElementById('filter-sum-from');
    const filterSumTo = document.getElementById('filter-sum-to');
    const applyFiltersBtn = document.getElementById('apply-filters');
    const resetFiltersBtn = document.getElementById('reset-filters');
    
    // Состояние фильтров
    const advancedFilters = {
        period: 'all',
        dateFrom: null,
        dateTo: null,
        search: '',
        status: 'all',
        type: 'all',
        worker: 'all',
        sumFrom: null,
        sumTo: null
    };
    
    // Переключение панели фильтров
    function updateToggleFiltersLabel() {
        if (!toggleFiltersBtn || !filtersContent) return;
        const expanded = (getComputedStyle(filtersContent).display !== 'none');
        const isMobile = window.innerWidth <= 768;
        toggleFiltersBtn.textContent = isMobile
            ? (expanded ? '▲' : '▼')
            : (expanded ? 'Свернуть ▲' : 'Развернуть ▼');
    }

    if (toggleFiltersBtn) {
        // init label
        updateToggleFiltersLabel();
        window.addEventListener('resize', updateToggleFiltersLabel);
        toggleFiltersBtn.addEventListener('click', () => {
            if (getComputedStyle(filtersContent).display === 'none') {
                filtersContent.style.display = 'block';
            } else {
                filtersContent.style.display = 'none';
            }
            updateToggleFiltersLabel();
        });
    }
    
    // Переключение секций (Статистика, Графики, Прогноз)
    document.querySelectorAll('.toggle-section-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const targetElement = document.getElementById(targetId);
            const textSpan = btn.querySelector('.text');
            
            if (targetElement) {
                if (targetElement.style.display === 'none') {
                    targetElement.style.display = targetElement.classList.contains('top-stats-grid') || 
                                                   targetElement.classList.contains('forecast-grid') ? 'grid' : 'block';
                    if (textSpan) textSpan.textContent = 'Свернуть ';
                    btn.innerHTML = `${textSpan ? textSpan.outerHTML : '<span class="text">Свернуть </span>'}▲`;
                    
                    // Обновляем графики при разворачивании секции с графиками
                    if (targetId === 'earnings-charts-container') {
                        setTimeout(() => {
                            if (window.timelineChart) window.timelineChart.resize();
                            if (window.pieChart) window.pieChart.resize();
                        }, 100);
                    }
                } else {
                    targetElement.style.display = 'none';
                    if (textSpan) textSpan.textContent = 'Развернуть ';
                    btn.innerHTML = `${textSpan ? textSpan.outerHTML : '<span class="text">Развернуть </span>'}▼`;
                }
            }
        });
    });
    
    // Показ/скрытие кастомных дат
    if (filterPeriod) {
        filterPeriod.addEventListener('change', () => {
            const isCustom = filterPeriod.value === 'custom';
            customDates.forEach(el => {
                el.style.display = isCustom ? 'flex' : 'none';
            });
        });
    }
    
    // Применение фильтров
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
            advancedFilters.period = filterPeriod.value;
            advancedFilters.dateFrom = dateFrom.value;
            advancedFilters.dateTo = dateTo.value;
            advancedFilters.search = searchName.value.trim().toLowerCase();
            advancedFilters.status = filterStatus.value;
            advancedFilters.type = filterType.value;
            advancedFilters.worker = filterWorker.value;
            advancedFilters.sumFrom = filterSumFrom.value ? parseFloat(filterSumFrom.value) : null;
            advancedFilters.sumTo = filterSumTo.value ? parseFloat(filterSumTo.value) : null;
            
            renderObjects();
            renderWorkerStats();
        });
    }
    
    // Сброс фильтров
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            filterPeriod.value = 'all';
            dateFrom.value = '';
            dateTo.value = '';
            searchName.value = '';
            filterStatus.value = 'all';
            filterType.value = 'all';
            filterWorker.value = 'all';
            filterSumFrom.value = '';
            filterSumTo.value = '';
            
            customDates.forEach(el => el.style.display = 'none');
            
            Object.keys(advancedFilters).forEach(key => {
                advancedFilters[key] = key === 'period' || key === 'status' || key === 'type' || key === 'worker' ? 'all' : null;
                if (key === 'search') advancedFilters[key] = '';
            });
            
            renderObjects();
            renderWorkerStats();
        });
    }
    // === КОНЕЦ РАСШИРЕННЫХ ФИЛЬТРОВ ===
    
    // === ЭКСПОРТ И РЕЗЕРВНОЕ КОПИРОВАНИЕ ===
    const exportExcelBtn = document.getElementById('export-excel-btn');
    const backupBtn = document.getElementById('backup-btn');
    const restoreBtn = document.getElementById('restore-btn');
    const restoreFileInput = document.getElementById('restore-file-input');
    
    // Экспорт в Excel (CSV)
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', () => {
            const csv = generateCSV();
            downloadFile(csv, `Отчет_${new Date().toLocaleDateString('ru-RU')}.csv`, 'text/csv;charset=utf-8;');
        });
    }
    
    function generateCSV() {
        const headers = ['Дата', 'Название', 'Услуга', 'Площадь', 'Стоимость', 'Работники', 'Статус', 'Тип'];
        const rows = window.objects.map(obj => [
            parseDateSafe(obj.timestamp).toLocaleDateString('ru-RU'),
            obj.name || '-',
            obj.service || '-',
            obj.area || '-',
            obj.cost || '-',
            obj.workers.map(w => typeof w === 'string' ? w : w.name).join('; '),
            obj.isPaid ? 'Оплачено' : 'Не оплачено',
            obj.isExpense ? 'Расход' : (obj.manualPrice ? 'Ручная цена' : (obj.isCustomService ? 'Услуга' : 'Обычный'))
        ]);
        
        const csvContent = [
            '\uFEFF' + headers.join(','), // BOM для правильной кодировки в Excel
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        return csvContent;
    }
    
    // Резервная копия
    if (backupBtn) {
        backupBtn.addEventListener('click', () => {
            const backup = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                objects: window.objects,
                workers: workers
            };
            
            const json = JSON.stringify(backup, null, 2);
            downloadFile(json, `Backup_${new Date().toLocaleDateString('ru-RU')}.json`, 'application/json');
            
            // Сохраняем также в localStorage для истории
            saveBackupToHistory(backup);
        });
    }
    
    // Восстановление
    if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
            restoreFileInput.click();
        });
    }
    
    if (restoreFileInput) {
        restoreFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const raw = JSON.parse(event.target.result);
                    const { objects: restoredObjects, workers: restoredWorkers } = normalizeBackup(raw);
                    
                    if (confirm('Восстановить данные из резервной копии? Текущие данные будут перезаписаны.')) {
                        window.objects = Array.isArray(restoredObjects) ? restoredObjects : [];
                        workers = (Array.isArray(restoredWorkers) ? restoredWorkers : (workers || []))
                            .map((w) => normalizeWorkerRecord(typeof w === 'object' ? w : { name: w, role: 'worker' }));
                        
                        saveData();
                        populateWorkers();
                        renderObjects();
                        renderWorkerStats();
                        
                        alert('Данные успешно восстановлены!');
                    }
                } catch (error) {
                    alert('Ошибка при восстановлении: ' + error.message);
                }
            };
            reader.readAsText(file);
            restoreFileInput.value = ''; // Сброс input
        });
    }
    
    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    function saveBackupToHistory(backup) {
        const backups = JSON.parse(localStorage.getItem('backups') || '[]');
        backups.push({
            timestamp: backup.timestamp,
            size: JSON.stringify(backup).length
        });
        
        // Храним только последние 10 копий в истории
        if (backups.length > 10) {
            backups.shift();
        }
        
        localStorage.setItem('backups', JSON.stringify(backups));
        localStorage.setItem(`backup_${backup.timestamp}`, JSON.stringify(backup));
    }
    
    // Локальное сохранение текущих данных (для восстановления/комментариев)
    function saveData() {
        try {
            localStorage.setItem('objects', JSON.stringify(window.objects || []));
            localStorage.setItem('workersData', JSON.stringify(workers || []));
        } catch (e) {
            console.error('Не удалось сохранить данные в localStorage:', e);
        }
    }
    
    // Приведение формата резервной копии к универсальному виду
    function normalizeBackup(input) {
        // Если массив - считаем, что это массив объектов (objects)
        if (Array.isArray(input)) {
            return { objects: input, workers: workers || [] };
        }
        // Если объект с полями objects/workers
        if (input && typeof input === 'object') {
            const normalized = { objects: [], workers: [] };
            if (Array.isArray(input.objects)) {
                normalized.objects = input.objects;
            }
            // workers может быть массивом строк или объектов {name,...}
            if (Array.isArray(input.workers)) {
                normalized.workers = input.workers;
            }
            // Если нет поля objects, но есть явные признаки массива объектов в корне
            if (!normalized.objects.length && Array.isArray(input.data)) {
                normalized.objects = input.data;
            }
            // Если в файле нет работников — не подменяем (для восстановления: оставить текущий список в приложении)
            if (!normalized.workers.length) {
                normalized.workers = workers || [];
            }
            return normalized;
        }
        // Иначе пустые данные
        return { objects: [], workers: workers || [] };
    }
    // === КОНЕЦ ЭКСПОРТА И РЕЗЕРВНОГО КОПИРОВАНИЯ ===
    
    // === ПРОГНОЗИРОВАНИЕ ДОХОДА ===
    function renderForecast() {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        
        // Фильтруем объекты за текущий и прошлый месяц
        const currentMonthObjects = window.objects.filter(obj => {
            if (obj.isExpense) return false;
            const objDate = new Date(obj.timestamp);
            return objDate.getMonth() === currentMonth && objDate.getFullYear() === currentYear;
        });
        
        const lastMonthObjects = window.objects.filter(obj => {
            if (obj.isExpense) return false;
            const objDate = new Date(obj.timestamp);
            return objDate.getMonth() === lastMonth && objDate.getFullYear() === lastMonthYear;
        });
        
        // Средний доход за последние 3 месяца
        const lastThreeMonthsIncome = [];
        for (let i = 0; i < 3; i++) {
            const targetMonth = currentMonth - i < 0 ? 12 + (currentMonth - i) : currentMonth - i;
            const targetYear = currentMonth - i < 0 ? currentYear - 1 : currentYear;
            
            const monthIncome = window.objects
                .filter(obj => {
                    if (obj.isExpense) return false;
                    const objDate = new Date(obj.timestamp);
                    return objDate.getMonth() === targetMonth && objDate.getFullYear() === targetYear;
                })
                .reduce((sum, obj) => sum + parseFloat(obj.cost || 0), 0);
            
            lastThreeMonthsIncome.push(monthIncome);
        }
        
        const avgIncome = lastThreeMonthsIncome.reduce((a, b) => a + b, 0) / 3;
        const avgObjects = window.objects.filter(obj => !obj.isExpense).length / Math.max(1, Math.ceil((now - new Date(window.objects[0]?.timestamp || now)) / (30 * 24 * 60 * 60 * 1000)));
        
        // Тренд
        const currentIncome = currentMonthObjects.reduce((sum, obj) => sum + parseFloat(obj.cost || 0), 0);
        const lastIncome = lastMonthObjects.reduce((sum, obj) => sum + parseFloat(obj.cost || 0), 0);
        const trend = lastIncome > 0 ? ((currentIncome - lastIncome) / lastIncome * 100) : 0;
        
        // Обновляем UI
        document.getElementById('forecast-income').textContent = `${avgIncome.toFixed(0)} ₽`;
        document.getElementById('forecast-objects').textContent = Math.round(avgObjects);
        document.getElementById('forecast-trend').textContent = `${trend > 0 ? '+' : ''}${trend.toFixed(1)}%`;
        document.getElementById('forecast-trend').style.color = trend > 0 ? '#27ae60' : trend < 0 ? '#e74c3c' : '#95a5a6';
    }
    
    // Делаем функцию доступной глобально для вкладки "Анализ работы"
    window.renderForecast = renderForecast;
    // === КОНЕЦ ПРОГНОЗИРОВАНИЯ ===

    // Переменные состояния
    window.objects = []; // Глобальная переменная
    let workers = [];
    window.workers = workers;
    let editMode = false;
    
    // Вспомогательные функции для работы с workers
    function getWorkerRole(workerName) {
        const worker = workers.find(w => typeof w === 'object' ? w.name === workerName : w === workerName);
        if (!worker) return 'worker';
        return typeof worker === 'object' ? (worker.role || 'worker') : 'worker';
    }
    
    function getWorkerName(worker) {
        return typeof worker === 'object' ? worker.name : worker;
    }
    
    function isForeman(workerName) {
        return getWorkerRole(workerName) === 'foreman';
    }
    
    function getWorkerIcon(workerName) {
        return isForeman(workerName) 
            ? '<span class="foreman-icon" title="Бригадир">👷</span>' 
            : '<span class="worker-icon" title="Работник">👨‍🔧</span>';
    }
    
    function getWorkerPercentage(workerName) {
        const worker = workers.find(w => typeof w === 'object' ? w.name === workerName : w === workerName);
        if (!worker || typeof worker !== 'object') {
            const configuredForemanPercent = Number(window.CALC_SETTINGS?.foremanPercent);
            return Number.isFinite(configuredForemanPercent) ? configuredForemanPercent : 15;
        }
        const personalPercent = Number(worker.foremanPercent);
        if (Number.isFinite(personalPercent)) return personalPercent;
        const configuredForemanPercent = Number(window.CALC_SETTINGS?.foremanPercent);
        return Number.isFinite(configuredForemanPercent) ? configuredForemanPercent : 15;
    }

    function shouldWorkerPayForemanPercentage(workerName) {
        const worker = workers.find(w => typeof w === 'object' ? w.name === workerName : w === workerName);
        // По умолчанию: обычные работники платят %, бригадиры — нет.
        if (!worker || typeof worker !== 'object') return !isForeman(workerName);
        if (typeof worker.paysForemanPercent === 'boolean') return worker.paysForemanPercent;
        return !isForeman(workerName);
    }

    function normalizeWorkerRecord(w) {
        const base = (w && typeof w === 'object') ? { ...w } : { name: String(w || '').trim(), role: 'worker' };
        delete base.group; /* устаревшее поле; роль только через role: worker | foreman */
        base.name = (base.name || '').trim() || 'Без имени';
        base.role = base.role === 'foreman' ? 'foreman' : 'worker';
        let pct = Number(base.percentage);
        if (!Number.isFinite(pct)) pct = 0;
        base.percentage = pct;
        const cfg = Number(window.CALC_SETTINGS?.foremanPercent);
        const defPct = Number.isFinite(cfg) ? cfg : 15;
        if (base.role === 'foreman') {
            base.paysForemanPercent = false;
            const fp = Number(base.foremanPercent);
            base.foremanPercent = Number.isFinite(fp) ? fp : 0;
        } else {
            if (typeof base.paysForemanPercent !== 'boolean') base.paysForemanPercent = true;
            const fp = Number(base.foremanPercent);
            base.foremanPercent = Number.isFinite(fp) ? fp : defPct;
        }
        return base;
    }

    function renderWorkersSettingsTab() {
        const wrap = document.getElementById('workers-settings-table-wrap');
        if (!wrap) return;
        wrap.textContent = '';
        const table = document.createElement('table');
        table.className = 'workers-settings-table';
        const thead = document.createElement('thead');
        const hr = document.createElement('tr');
        ['Имя', 'Роль', 'Платит % мастеру', '% с работника', ''].forEach((label) => {
            const th = document.createElement('th');
            th.textContent = label;
            hr.appendChild(th);
        });
        thead.appendChild(hr);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        workers.forEach((w, idx) => {
            const nw = normalizeWorkerRecord(typeof w === 'object' ? w : { name: w, role: 'worker' });
            const row = document.createElement('tr');
            row.dataset.index = String(idx);

            const tdName = document.createElement('td');
            tdName.dataset.label = 'Имя';
            const inpName = document.createElement('input');
            inpName.type = 'text';
            inpName.className = 'ws-name';
            inpName.value = nw.name;
            tdName.appendChild(inpName);

            const tdRole = document.createElement('td');
            tdRole.dataset.label = 'Роль';
            const selRole = document.createElement('select');
            selRole.className = 'ws-role';
            [['worker', 'Рабочий'], ['foreman', 'Бригадир']].forEach(([val, label]) => {
                const op = document.createElement('option');
                op.value = val;
                op.textContent = label;
                if (nw.role === val) op.selected = true;
                selRole.appendChild(op);
            });
            tdRole.appendChild(selRole);

            const tdPays = document.createElement('td');
            tdPays.dataset.label = 'Платит % мастеру';
            tdPays.className = 'ws-pays-cell';
            const lab = document.createElement('label');
            lab.className = 'ws-pays-label';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.className = 'ws-pays';
            chk.checked = nw.paysForemanPercent;
            if (nw.role === 'foreman') chk.disabled = true;
            lab.appendChild(chk);
            tdPays.appendChild(lab);

            const tdFpct = document.createElement('td');
            tdFpct.dataset.label = '% с работника';
            const inpFpct = document.createElement('input');
            inpFpct.type = 'number';
            inpFpct.className = 'ws-fpct';
            inpFpct.min = '0';
            inpFpct.max = '100';
            inpFpct.step = '1';
            inpFpct.value = String(nw.foremanPercent);
            if (nw.role === 'foreman') {
                inpFpct.disabled = true;
                inpFpct.title = 'У бригадира не удерживается';
            }
            tdFpct.appendChild(inpFpct);

            const tdDel = document.createElement('td');
            tdDel.dataset.label = 'Действие';
            const btnDel = document.createElement('button');
            btnDel.type = 'button';
            btnDel.className = 'btn secondary ws-del';
            btnDel.textContent = 'Удалить';
            tdDel.appendChild(btnDel);

            row.appendChild(tdName);
            row.appendChild(tdRole);
            row.appendChild(tdPays);
            row.appendChild(tdFpct);
            row.appendChild(tdDel);

            selRole.addEventListener('change', () => {
                const isF = selRole.value === 'foreman';
                chk.disabled = isF;
                inpFpct.disabled = isF;
                if (isF) {
                    chk.checked = false;
                    inpFpct.value = '0';
                } else {
                    chk.checked = true;
                    const def = Number(window.CALC_SETTINGS?.foremanPercent);
                    inpFpct.value = String(Number.isFinite(def) ? def : 15);
                }
            });
            btnDel.addEventListener('click', () => {
                const i = parseInt(row.dataset.index, 10);
                if (!Number.isNaN(i)) workers.splice(i, 1);
                renderWorkersSettingsTab();
            });
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
    }

    function collectWorkersFromSettingsTable() {
        const wrap = document.getElementById('workers-settings-table-wrap');
        if (!wrap) return [];
        const rows = wrap.querySelectorAll('tbody tr');
        const list = [];
        rows.forEach((row) => {
            const name = row.querySelector('.ws-name')?.value?.trim() || '';
            if (!name) return;
            const rowIndex = Number.parseInt(row.dataset.index || '', 10);
            const oldWorker = Number.isFinite(rowIndex) ? workers[rowIndex] : null;
            const oldName = oldWorker ? getWorkerName(oldWorker) : '';
            const role = row.querySelector('.ws-role')?.value === 'foreman' ? 'foreman' : 'worker';
            const pays = row.querySelector('.ws-pays')?.checked;
            const fpct = parseFloat(row.querySelector('.ws-fpct')?.value);
            const prev = workers.find(w => getWorkerName(w) === name);
            const percentage = prev && typeof prev === 'object' && typeof prev.percentage === 'number' && Number.isFinite(prev.percentage)
                ? prev.percentage
                : 0;
            const normalized = normalizeWorkerRecord({
                name,
                role,
                paysForemanPercent: role === 'foreman' ? false : !!pays,
                foremanPercent: role === 'foreman' ? 0 : (Number.isFinite(fpct) ? fpct : 15),
                percentage
            });
            normalized.__oldName = oldName || normalized.name;
            list.push(normalized);
        });
        const names = list.map(x => x.name);
        const dup = names.find((n, i) => names.indexOf(n) !== i);
        if (dup) {
            alert('Имена работников не должны повторяться: ' + dup);
            return null;
        }
        return list;
    }

    function initWorkersSettingsControls() {
        const root = document.getElementById('calc-settings');
        if (!root || root.dataset.workersSettingsInit === '1') return;
        root.dataset.workersSettingsInit = '1';
        document.getElementById('btn-workers-add')?.addEventListener('click', () => {
            workers.push(normalizeWorkerRecord({ name: 'Новый', role: 'worker' }));
            renderWorkersSettingsTab();
        });
        document.getElementById('btn-workers-apply')?.addEventListener('click', () => {
            const next = collectWorkersFromSettingsTable();
            if (!next) return;
            const renameMap = {};
            next.forEach((w) => {
                const oldName = (w.__oldName || '').trim();
                const newName = (w.name || '').trim();
                if (oldName && newName && oldName !== newName) {
                    renameMap[oldName] = newName;
                }
                delete w.__oldName;
            });
            const hasRenames = Object.keys(renameMap).length > 0;
            if (hasRenames) {
                window.objects = (window.objects || []).map((obj) => {
                    if (!obj || typeof obj !== 'object') return obj;
                    if (Array.isArray(obj.workers)) {
                        obj.workers = obj.workers.map((w) => {
                            if (typeof w === 'string') return renameMap[w] || w;
                            if (w && typeof w === 'object') {
                                const current = getWorkerName(w);
                                if (renameMap[current]) return { ...w, name: renameMap[current] };
                            }
                            return w;
                        });
                    }
                    if (Array.isArray(obj.receivers)) {
                        obj.receivers = obj.receivers.map((name) => renameMap[name] || name);
                    }
                    if (Array.isArray(obj.issuedMoney)) {
                        obj.issuedMoney = obj.issuedMoney.map((im) => {
                            if (!im || typeof im !== 'object') return im;
                            return renameMap[im.name] ? { ...im, name: renameMap[im.name] } : im;
                        });
                    }
                    return obj;
                });
            }
            workers = next;
            window.workers = workers;
            saveData();
            populateWorkers();
            renderWorkersSettingsTab();
            renderObjects();
            if (typeof window.renderWorkerStats === 'function') window.renderWorkerStats();
        });
        document.getElementById('btn-workers-reload')?.addEventListener('click', () => {
            location.reload();
        });
    }

    let prices = [];
    let customServiceNames = [];
    let customServices = [];
    let expenseTypes = [];

    serviceSelect.addEventListener('click', () => {
        serviceOptions.classList.toggle('show');
    });

    serviceOptions.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const selectedValue = e.target.getAttribute('data-value');
            serviceSelect.innerHTML = `${selectedValue} <span class="dropdown-icon">▾</span>`;
            serviceSelect.value = selectedValue;
            toggleInputState(customServiceForm, 'serviceName', serviceSelect);
            serviceOptions.classList.remove('show');
        }
    });

    // Инициализация автокомплита для расходов
    expenseNameSuggestions.id = 'expense-name-suggestions';
    expenseNameSuggestions.className = 'suggestions-list';
    if (!expenseNameInput.nextElementSibling) expenseNameInput.parentElement.appendChild(expenseNameSuggestions);

    // Установка текстов кнопок
    objectForm.querySelector('button[type="submit"]').textContent = 'Добавить объект';
    expenseForm.querySelector('button[type="submit"]').textContent = 'Добавить расход';
    manualPriceForm.querySelector('button[type="submit"]').textContent = 'Добавить объект';
    customServiceForm.querySelector('button[type="submit"]').textContent = 'Добавить услугу';

    // Функции для objectForm (выносим наружу, чтобы ссылки не менялись)
    function toggleServiceOptions() {
        optionsList.classList.toggle('show');
    }

    function selectServiceOption(e) {
        const selectedValueText = e.target.getAttribute('data-value');
        selectDisplay.innerHTML = `${e.target.textContent} <span class="dropdown-icon">▾</span>`;
        selectedValue.value = selectedValueText;
        optionsList.classList.remove('show');
    }

    // Функции для manualPriceForm (выносим наружу, чтобы ссылки не менялись)
    function toggleManualServiceOptions() {
        manualOptionsList.classList.toggle('show');
    }

    function selectManualServiceOption(e) {
        const selectedValueText = e.target.getAttribute('data-value');
        const [name, unit] = selectedValueText.split('|');
        manualSelectDisplay.innerHTML = `${name} (${unit}) <span class="dropdown-icon">▾</span>`;
        manualSelectedValue.value = selectedValueText;
        manualPriceLabel.textContent = `Цена за ${unit} (₽):`;
        manualOptionsList.classList.remove('show');
    }

    // Функция переключения форм
    function showForm(formToShow) {
        [objectForm, expenseForm, manualPriceForm, customServiceForm].forEach(f => {
            const cancelBtn = f.querySelector('.cancel-btn');
            const submitBtn = f.querySelector('button[type="submit"]');
            if (f === formToShow) {
                f.style.display = 'block';
                resetFormFields(f);
                if (f === expenseForm) toggleFuelCalcMode();
                cancelBtn.onclick = () => {
                    f.reset();
                    resetFormFields(f);
                    f.dataset.isEditing = 'false';
                    f.dataset.editIndex = '';
                    submitBtn.textContent = f === expenseForm ? 'Добавить расход' :
                    (f === customServiceForm ? 'Добавить услугу' : 'Добавить объект');
                    if (f === expenseForm) {
                        expenseTypeSelect.innerHTML = 'Выберите тип расхода <span class="dropdown-icon">▾</span>';
                        expenseTypeValue.value = '';
                        toggleInputState(f, 'expenseName', expenseTypeValue);
                        f.querySelector('.fuel-calc-mode').style.display = 'none';
                    } else if (f === customServiceForm) {
                        serviceSelect.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                        serviceSelect.value = '';
                        toggleInputState(f, 'serviceName', serviceSelect);
                    } else if (f === manualPriceForm) {
                        manualSelectDisplay.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                        manualSelectedValue.value = '';
                    } else {
                        selectDisplay.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                        selectedValue.value = '';
                    }
                    f.onsubmit = f === expenseForm ?
                    (e) => addObject(e, true) :
                    (f === customServiceForm ?
                    customServiceForm.onsubmit :
                    (f === manualPriceForm ? (e) => addObject(e, false, true) : (e) => addObject(e)));
                    showForm(null);
                };

                if (f === objectForm) {
                    selectDisplay.removeEventListener('click', toggleServiceOptions);
                    selectDisplay.addEventListener('click', toggleServiceOptions);

                    optionsList.querySelectorAll('li').forEach(li => {
                        li.removeEventListener('click', selectServiceOption);
                        li.addEventListener('click', selectServiceOption);
                    });
                }

                if (f === manualPriceForm) {
                    populateManualServiceSelect(prices, manualSelectDisplay, manualSelectedValue, manualOptionsList, manualPriceLabel); // Добавлено: перезаполнение списка на всякий случай
                    manualSelectDisplay.removeEventListener('click', toggleManualServiceOptions);
                    manualSelectDisplay.addEventListener('click', toggleManualServiceOptions);

                    manualOptionsList.querySelectorAll('li').forEach(li => {
                        li.removeEventListener('click', selectManualServiceOption);
                        li.addEventListener('click', selectManualServiceOption);
                    });
                }
            } else {
                f.style.display = 'none';
            }
        });
        if (formToShow) populateSuggestions(formToShow);
    }

    // Сброс состояния полей формы
    function resetFormFields(form) {
        const lengthInput = form.querySelector('input[name="length"]');
        const widthInput = form.querySelector('input[name="width"]');
        const areaInput = form.querySelector('input[name="area"]');
        if (lengthInput && widthInput && areaInput) {
            lengthInput.disabled = false;
            widthInput.disabled = false;
            areaInput.disabled = false;
        }
        if (form === expenseForm) {
            const fuelModeRadios = form.querySelectorAll('input[name="fuelMode"]');
            const amountInput = form.querySelector('input[name="expenseAmount"]');
            const distanceInput = form.querySelector('.distance-input');
            fuelModeRadios.forEach(radio => radio.checked = radio.value === 'amount');
            amountInput.style.display = 'block';
            distanceInput.style.display = 'none';
        }
        // Сбрасываем галочку "Ростиковская методика"
        const rostikMethodCheckbox = form.querySelector('input[name="useRostikMethod"]');
        if (rostikMethodCheckbox) rostikMethodCheckbox.checked = false;
    }

    // Управление состоянием полей ввода
    function toggleInputState(form, inputName, selectElement) {
        const inputWrapper = form.querySelector(`.form-group:has(input[name="${inputName}"])`);
        const input = inputWrapper.querySelector(`input[name="${inputName}"]`);
        const selectedValue = selectElement.value || (selectElement.tagName === 'DIV' ? selectElement.textContent.trim().split(' ')[0] : '');

        if (form === customServiceForm) {
            if (selectedValue && selectedValue !== "Своё название" && selectedValue !== "Выберите") {
                inputWrapper.style.display = 'none';
                input.disabled = true;
                input.value = '';
            } else {
                inputWrapper.style.display = 'block';
                input.disabled = false;
                input.focus();
            }
        } else if (form === expenseForm) {
            if (selectedValue === "Своё название") {
                inputWrapper.style.display = 'block';
                input.disabled = false;
                input.focus();
            } else if (selectedValue && selectedValue !== "Выберите") {
                inputWrapper.style.display = 'none';
                input.disabled = true;
                input.value = '';
            } else {
                inputWrapper.style.display = 'none';
                input.disabled = true;
                input.value = '';
            }
            toggleFuelCalcMode();
        } else {
            if (selectedValue && selectedValue !== "Своё название" && selectedValue !== "Выберите") {
                input.disabled = true;
                input.value = '';
            } else {
                input.disabled = false;
            }
        }
    }

    // Переключение режима расчета бензина
    function toggleFuelCalcMode() {
        const expenseNameInput = expenseForm.querySelector('input[name="expenseName"]');
        const expenseName = expenseNameInput.disabled || expenseNameInput.style.display === 'none'
        ? expenseTypeValue.value.trim()
        : expenseNameInput.value.trim();
        const fuelCalcMode = expenseForm.querySelector('.fuel-calc-mode');
        const amountInput = expenseForm.querySelector('input[name="expenseAmount"]');
        const distanceInput = expenseForm.querySelector('.distance-input');
        const mileageInput = expenseForm.querySelector('.mileage-input');
        const distanceValueInput = distanceInput.querySelector('input[name="distance"]');
        const startMileageInput = mileageInput.querySelector('input[name="startMileage"]');
        const endMileageInput = mileageInput.querySelector('input[name="endMileage"]');
        const radioButtons = expenseForm.querySelectorAll('input[name="fuelMode"]');
        const receivers = Array.from(expenseReceiversCheckboxGroup.querySelectorAll('input:checked')).map(input => input.value);

        if (expenseName.toLowerCase() === 'бензин' && receivers.length > 0) {
            fuelCalcMode.style.display = 'block';
            radioButtons.forEach(radio => {
                radio.removeEventListener('change', updateFuelModeDisplay);
                radio.addEventListener('change', updateFuelModeDisplay);
            });
            updateFuelModeDisplay();
        } else {
            fuelCalcMode.style.display = 'none';
            amountInput.style.display = 'block';
            distanceInput.style.display = 'none';
            mileageInput.style.display = 'none';
            amountInput.removeAttribute('readonly');
            amountInput.setAttribute('required', 'required');
            distanceValueInput.removeAttribute('required');
            startMileageInput.removeAttribute('required');
            endMileageInput.removeAttribute('required');
            distanceValueInput.value = '';
            startMileageInput.value = '';
            endMileageInput.value = '';
        }

        function updateFuelModeDisplay() {
            const selectedMode = expenseForm.querySelector('input[name="fuelMode"]:checked').value;
            const fuelConsumption = 6.7; // 6,7 литров на 100 км
            const fuelPrice = 61; // 61 рубль за литр

            if (selectedMode === 'amount') {
                amountInput.style.display = 'block';
                distanceInput.style.display = 'none';
                mileageInput.style.display = 'none';
                amountInput.removeAttribute('readonly');
                amountInput.setAttribute('required', 'required');
                distanceValueInput.removeAttribute('required');
                startMileageInput.removeAttribute('required');
                endMileageInput.removeAttribute('required');
                distanceValueInput.value = '';
                startMileageInput.value = '';
                endMileageInput.value = '';
            } else if (selectedMode === 'distance') {
                amountInput.style.display = 'block';
                distanceInput.style.display = 'block';
                mileageInput.style.display = 'none';
                amountInput.setAttribute('readonly', 'true');
                amountInput.removeAttribute('required');
                distanceValueInput.setAttribute('required', 'required');
                startMileageInput.removeAttribute('required');
                endMileageInput.removeAttribute('required');
                startMileageInput.value = '';
                endMileageInput.value = '';
                distanceValueInput.addEventListener('input', () => {
                    const distance = parseFloat(distanceValueInput.value) || 0;
                    const liters = (distance * fuelConsumption) / 100;
                    const calculatedAmount = -(liters * fuelPrice);
                    amountInput.value = distance > 0 ? calculatedAmount.toFixed(2) : '';
                });
                const distance = parseFloat(distanceValueInput.value) || 0;
                const liters = (distance * fuelConsumption) / 100;
                amountInput.value = distance > 0 ? -(liters * fuelPrice).toFixed(2) : '';
            } else if (selectedMode === 'mileage') {
                amountInput.style.display = 'block';
                distanceInput.style.display = 'none';
                mileageInput.style.display = 'block';
                amountInput.setAttribute('readonly', 'true');
                amountInput.removeAttribute('required');
                distanceValueInput.removeAttribute('required');
                startMileageInput.setAttribute('required', 'required');
                endMileageInput.setAttribute('required', 'required');
                distanceValueInput.value = '';

                function updateMileageCalculation() {
                    const start = parseFloat(startMileageInput.value) || 0;
                    const end = parseFloat(endMileageInput.value) || 0;
                    const distance = end > start ? end - start : 0;
                    const liters = (distance * fuelConsumption) / 100;
                    const calculatedAmount = -(liters * fuelPrice);
                    amountInput.value = distance > 0 ? calculatedAmount.toFixed(2) : '';
                }

                startMileageInput.addEventListener('input', updateMileageCalculation);
                endMileageInput.addEventListener('input', updateMileageCalculation);
                updateMileageCalculation();
            }
        }
    }

    function populateSuggestions(activeForm) {
        const uniqueObjectNames = [...new Set(window.objects.filter(obj => !obj.isExpense && !obj.isCustomService).map(obj => obj.name))];
        const uniqueExpenseNames = [...new Set(window.objects.filter(obj => obj.isExpense).map(obj => obj.name))];

        const renderSuggestions = (input, suggestionsList, names) => {
            suggestionsList.innerHTML = '';
            const inputValue = input.value.trim().toLowerCase();
            const filteredNames = names.filter(name => name.toLowerCase().includes(inputValue));

            filteredNames.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                li.addEventListener('click', () => {
                    input.value = name;
                    suggestionsList.classList.remove('show');
                    if (activeForm === expenseForm) toggleFuelCalcMode();
                });
                    suggestionsList.appendChild(li);
            });

            if (filteredNames.length > 0 && inputValue && !input.disabled) suggestionsList.classList.add('show');
            else suggestionsList.classList.remove('show');
        };

            if (activeForm === expenseForm && !expenseNameInput.disabled) {
                renderSuggestions(expenseNameInput, expenseNameSuggestions, uniqueExpenseNames);
            } else if (activeForm === objectForm) {
                renderSuggestions(objectNameInput, objectNameSuggestions, uniqueObjectNames);
            } else if (activeForm === manualPriceForm) {
                renderSuggestions(manualObjectNameInput, manualObjectNameSuggestions, uniqueObjectNames);
            } else if (activeForm === customServiceForm) {
                renderSuggestions(serviceNameInput, serviceNameSuggestions, customServiceNames);
            }
    }

    // Обработчики событий для переключения выпадающих списков
    expenseTypeSelect.addEventListener('click', () => expenseTypeOptions.classList.toggle('show'));

    expenseTypeOptions.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const selectedValue = e.target.getAttribute('data-value');
            expenseTypeSelect.innerHTML = `${selectedValue} <span class="dropdown-icon">▾</span>`;
            expenseTypeValue.value = selectedValue;
            toggleInputState(expenseForm, 'expenseName', expenseTypeValue);
            expenseTypeOptions.classList.remove('show');
        }
    });

    expenseNameInput.addEventListener('input', () => {
        toggleFuelCalcMode();
        populateSuggestions(expenseForm);
    });

    expenseReceiversCheckboxGroup.addEventListener('change', toggleFuelCalcMode);

    document.addEventListener('click', (e) => {
        if (!selectDisplay.contains(e.target) && !optionsList.contains(e.target)) optionsList.classList.remove('show');
        if (!manualSelectDisplay.contains(e.target) && !manualOptionsList.contains(e.target)) manualOptionsList.classList.remove('show');
        if (!serviceSelect.contains(e.target) && !serviceOptions.contains(e.target)) serviceOptions.classList.remove('show');
        if (!expenseTypeSelect.contains(e.target) && !expenseTypeOptions.contains(e.target)) expenseTypeOptions.classList.remove('show');
    });

        // Загрузка данных
        function loadData() {
            const expenseAmountInput = expenseForm.querySelector('input[name="expenseAmount"]');
            expenseAmountInput.addEventListener('focus', () => {
                if (!expenseAmountInput.value.startsWith('-')) expenseAmountInput.value = '-';
            });
            expenseAmountInput.addEventListener('input', () => {
                const value = expenseAmountInput.value;
                if (value === '-' || value === '') return;
                if (!value.startsWith('-')) {
                    expenseAmountInput.value = '-' + value.replace('-', '');
                } else if (parseFloat(value) >= 0 && value !== '-') {
                    expenseAmountInput.value = '-' + Math.abs(parseFloat(value)).toString();
                }
            });

            const fetchOptions = {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-store'
                }
            };

            const maxRetries = 3;
            const retryDelay = 1000; // 1 секунда

            async function fetchWithRetry(url, retryCount = 0) {
                try {
                    const response = await fetch(url, fetchOptions);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const data = await response.json();
                    return data;
                } catch (error) {
                    console.error(`Ошибка загрузки ${url}:`, error);
                    if (retryCount < maxRetries) {
                        console.log(`Повторная попытка загрузки ${url} (${retryCount + 1}/${maxRetries})...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        return fetchWithRetry(url, retryCount + 1);
                    }
                    console.error(`Не удалось загрузить ${url} после ${maxRetries} попыток`);
                    return null;
                }
            }

            async function loadAllData() {
                try {
                    const [encryptedObjectsData, templateWorkersJson, pricesData, customServicesData, expenseTypesData] = await Promise.all([
                        fetchWithRetry(calcUrl('../upload/save.enc.json')),
                        fetchWithRetry(calcUrl('json/workers.json')),
                        fetchWithRetry(calcUrl('json/prices.json')),
                        fetchWithRetry(calcUrl('json/custom-services.json')),
                        fetchWithRetry(calcUrl('json/expense-types.json'))
                    ]);

                    let objectsData = null;
                    const encryptedSource = (encryptedObjectsData && encryptedObjectsData.__encryptedBackup)
                        ? encryptedObjectsData
                        : null;
                    if (encryptedSource) {
                        const password = prompt('Найден зашифрованный файл в папке upload (save.enc.json). Введите пароль для загрузки данных:');
                        if (password) {
                            try {
                                objectsData = await decryptBackupData(encryptedSource, password);
                            } catch (decryptError) {
                                if (decryptError && decryptError.message === 'WEB_CRYPTO_UNAVAILABLE') {
                                    alert(
                                        'Шифрованный save.enc.json найден, но шифрование недоступно в текущем окружении.\n' +
                                        'Откройте сайт через https или localhost/127.0.0.1.'
                                    );
                                } else {
                                    alert('Не удалось расшифровать save.enc.json. Проверьте пароль.');
                                }
                            }
                        } else {
                            alert('Пароль не введен. Будет использован пустой список объектов.');
                        }
                    }

                    // Объекты из save: массив ИЛИ { objects, workers? }
                    if (!objectsData) {
                        console.error('Не удалось загрузить upload/save.enc.json');
                        window.objects = [];
                    } else if (Array.isArray(objectsData)) {
                        window.objects = objectsData;
                    } else if (objectsData && typeof objectsData === 'object') {
                        let rawObjs = objectsData.objects;
                        if (!Array.isArray(rawObjs) && Array.isArray(objectsData.data)) {
                            rawObjs = objectsData.data;
                        }
                        window.objects = Array.isArray(rawObjs) ? rawObjs : [];
                    } else {
                        window.objects = [];
                    }
                    if (!Array.isArray(window.objects)) {
                        console.warn('Поле objects в save не массив — используется пустой список');
                        window.objects = [];
                    }

                    let workersFromSave = null;
                    if (objectsData && typeof objectsData === 'object' && !Array.isArray(objectsData)
                        && Array.isArray(objectsData.workers) && objectsData.workers.length > 0) {
                        workersFromSave = objectsData.workers;
                    }

                    let workersPayload = templateWorkersJson;
                    if (workersPayload && typeof workersPayload === 'object' && !Array.isArray(workersPayload)
                        && Array.isArray(workersPayload.workers)) {
                        workersPayload = workersPayload.workers;
                    }
                    if (!workersPayload || !Array.isArray(workersPayload) || workersPayload.length === 0) {
                        const altWorkersUrl = new URL('json/workers.json', window.location.href).href;
                        if (altWorkersUrl !== calcUrl('json/workers.json')) {
                            const retry = await fetchWithRetry(altWorkersUrl);
                            let r = retry;
                            if (r && typeof r === 'object' && !Array.isArray(r) && Array.isArray(r.workers)) {
                                r = r.workers;
                            }
                            if (Array.isArray(r) && r.length) workersPayload = r;
                        }
                    }
                    if (!workersPayload || !Array.isArray(workersPayload) || workersPayload.length === 0) {
                        console.error('Не удалось загрузить workers.json или файл пуст — используется запасной список');
                        workersPayload = [
                            { name: 'Артём', role: 'foreman' },
                            { name: 'Коля', role: 'foreman' },
                            { name: 'Слава', role: 'worker' },
                            { name: 'Женя', role: 'worker' }
                        ];
                    }
                    workersPayload = workersPayload.map(normalizeWorkerRecord);

                    if (workersFromSave) {
                        workers = workersFromSave.map(normalizeWorkerRecord);
                        window.workers = workers;
                    } else {
                        workers = workersPayload;
                        window.workers = workers;
                    }
                    if (!workers.length) {
                        console.warn('Список работников пуст после загрузки — подставлен запасной список');
                        workers = [
                            { name: 'Артём', role: 'foreman' },
                            { name: 'Коля', role: 'foreman' },
                            { name: 'Слава', role: 'worker' },
                            { name: 'Женя', role: 'worker' }
                        ].map(normalizeWorkerRecord);
                        window.workers = workers;
                    }

                    if (!pricesData) {
                        console.error('Не удалось загрузить prices.json');
                        prices = [];
                    } else {
                        prices = pricesData;
                    }

                    if (!customServicesData) {
                        console.error('Не удалось загрузить custom-services.json');
                        customServices = [];
                    } else {
                        customServices = customServicesData;
                    }

                    if (!expenseTypesData) {
                        console.error('Не удалось загрузить expense-types.json');
                        expenseTypes = [];
                    } else {
                        expenseTypes = expenseTypesData;
                    }

                    // Добавляем стандартные значения
                    expenseTypes.unshift({ name: "Своё название" });
                    expenseTypes.push({ name: "Еда" }, { name: "Займ" });
                    customServices.unshift({ name: "Своё название" });

                    customServiceNames = [...new Set(window.objects.filter(obj => obj.isCustomService).map(obj => obj.name))];

                    saveData();

                    // Обновляем UI
                    renderObjects();
                    renderWorkerStats();
                    populateWorkers();
                    populateServiceSelect(prices, selectDisplay, selectedValue, optionsList);
                    populateManualServiceSelect(prices, manualSelectDisplay, manualSelectedValue, manualOptionsList, manualPriceLabel);
                    populateCustomServiceSelect(customServices);
                    populateExpenseTypeSelect(expenseTypes);
                    populateSuggestions(objectForm);

                    toggleInputState(expenseForm, 'expenseName', expenseTypeValue);
                    toggleInputState(customServiceForm, 'serviceName', serviceSelect);

                } catch (error) {
                    console.error('Ошибка при загрузке данных:', error);
                    alert('Произошла ошибка при загрузке данных. Пожалуйста, обновите страницу или попробуйте позже.');
                }
            }

            loadAllData();
        }

        loadData();
        initWorkersSettingsControls();

        // Обработчик отправки формы кастомной услуги
        customServiceForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const isEditing = customServiceForm.dataset.isEditing === 'true';
            const serviceName = serviceNameInput.disabled || serviceNameInput.style.display === 'none'
            ? serviceSelect.value
            : serviceNameInput.value.trim();
            const servicePrice = parseFloat(customServiceForm.querySelector('input[name="servicePrice"]').value);
            const isPaid = customServiceForm.querySelector('input[name="isPaid"]').checked;
            const useRostikMethod = customServiceForm.querySelector('input[name="useRostikMethod"]').checked;
            const workersData = Array.from(serviceWorkersCheckboxGroup.querySelectorAll('input:checked')).map(input => {
                const ktuInput = customServiceForm.querySelector(`input[name="servicektu_${input.value}"]`);
                return { name: input.value, ktu: ktuInput.value ? parseFloat(ktuInput.value) : 1 };
            });
            // Собираем данные о выданных деньгах
            const issuedMoney = Array.from(customServiceForm.querySelectorAll('.issued-money-group input[type="checkbox"]:checked')).map(checkbox => {
                const workerName = checkbox.value;
                const amountInput = customServiceForm.querySelector(`input[name="issuedamount_${workerName}"]`);
                const amount = parseFloat(amountInput.value) || 0;
                return amount > 0 ? { name: workerName, amount: amount.toFixed(2) } : null;
            }).filter(item => item !== null);

            if (!serviceName || isNaN(servicePrice) || servicePrice <= 0 || workersData.length === 0 || workersData.some(w => w.ktu <= 0)) {
                alert('Заполните все поля корректно!');
                return;
            }

            const totalKtu = workersData.reduce((sum, w) => sum + w.ktu, 0);
            const object = {
                name: serviceName,
                service: serviceName,
                cost: servicePrice.toFixed(2),
                workers: useRostikMethod ? (() => {
                    const numWorkers = workersData.length;
                    let baseAmountPerWorker = servicePrice / numWorkers;
                    let initialWorkersWithCost = workersData.map(w => ({
                        name: w.name,
                        ktu: w.ktu,
                        cost: baseAmountPerWorker * w.ktu
                    }));

                    const distributedAmount = initialWorkersWithCost.reduce((sum, w) => sum + w.cost, 0);
                    const remainingAmount = servicePrice - distributedAmount;

                    const workersWithKtu1 = workersData.filter(w => w.ktu === 1).length;
                    if (workersWithKtu1 > 0 && remainingAmount > 0) {
                        const additionalPerKtu1Worker = remainingAmount / workersWithKtu1;
                        return initialWorkersWithCost.map(w => ({
                            name: w.name,
                            ktu: w.ktu,
                            cost: (w.ktu === 1 ? w.cost + additionalPerKtu1Worker : w.cost).toFixed(2)
                        }));
                    } else {
                        return initialWorkersWithCost.map(w => ({
                            name: w.name,
                            ktu: w.ktu,
                            cost: w.cost.toFixed(2)
                        }));
                    }
                })() : workersData.map(w => ({ name: w.name, ktu: w.ktu, cost: (servicePrice * w.ktu / totalKtu).toFixed(2) })),
                timestamp: new Date().toISOString(),
                isExpense: false,
                isCustomService: true,
                isPaid: isPaid,
                useRostikMethod: useRostikMethod,
                issuedMoney,
                editHistory: isEditing ? window.objects[customServiceForm.dataset.editIndex]?.editHistory || [] : []
            };

            if (isEditing) {
                const index = parseInt(customServiceForm.dataset.editIndex);
                const oldObj = window.objects[index];
                const changes = [];
                if (serviceName !== oldObj.name) changes.push(`Название: "${oldObj.name}" → "${serviceName}"`);
                if (servicePrice !== parseFloat(oldObj.cost)) changes.push(`Стоимость: ${oldObj.cost} → ${servicePrice}`);
                if (JSON.stringify(object.workers) !== JSON.stringify(oldObj.workers)) changes.push(`Участники: "${oldObj.workers.map(w => `${w.name} (КТУ ${w.ktu})`).join(', ')}" → "${object.workers.map(w => `${w.name} (КТУ ${w.ktu})`).join(', ')}"`);
                if (isPaid !== oldObj.isPaid) changes.push(`Статус выплаты: "${oldObj.isPaid ? 'Выплачено' : 'Не выплачено'}" → "${isPaid ? 'Выплачено' : 'Не выплачено'}"`);
                if (useRostikMethod !== oldObj.useRostikMethod) changes.push(`Методика: "${oldObj.useRostikMethod ? 'Ростиковская' : 'Стандартная'}" → "${useRostikMethod ? 'Ростиковская' : 'Стандартная'}"`);
                // Проверяем изменения в "Выданные деньги"
                const oldIssuedMoneyStr = oldObj.issuedMoney ? oldObj.issuedMoney.map(im => `${im.name}: ${im.amount}`).join(', ') : 'Нет';
                const newIssuedMoneyStr = issuedMoney.length > 0 ? issuedMoney.map(im => `${im.name}: ${im.amount}`).join(', ') : 'Нет';
                if (oldIssuedMoneyStr !== newIssuedMoneyStr) {
                    changes.push(`Выданные деньги: "${oldIssuedMoneyStr}" → "${newIssuedMoneyStr}"`);
                }

                if (changes.length > 0) {
                    object.editedTimestamp = new Date().toISOString();
                    object.editHistory.push({ timestamp: object.editedTimestamp, changes: changes.join(', ') });
                }
                object.isPaid = isPaid;
                window.objects[index] = object;
            } else {
                window.objects.unshift(object);
            }

            customServiceNames = [...new Set(window.objects.filter(obj => obj.isCustomService).map(obj => obj.name))];
            renderObjects();
            renderWorkerStats();
            populateSuggestions(customServiceForm);
            customServiceForm.reset();
            customServiceForm.dataset.isEditing = 'false';
            customServiceForm.dataset.editIndex = '';
            showForm(null);
            alert(isEditing ? 'Услуга изменена.' : 'Услуга добавлена.');
        });

        objectForm.addEventListener('submit', (e) => {
            if (objectForm.dataset.isEditing !== 'true') addObject(e);
        });

            expenseForm.addEventListener('submit', (e) => {
                if (expenseForm.dataset.isEditing !== 'true') addObject(e, true);
            });

                manualPriceForm.addEventListener('submit', (e) => {
                    if (manualPriceForm.dataset.isEditing !== 'true') addObject(e, false, true);
                });

                    function populateWorkers() {
                        const createCheckbox = (name, group, prefix, withKtu = false, withAmount = false, withArea = false) => {
                            const label = document.createElement('label');
                            label.innerHTML = `
                            <input type="checkbox" name="${prefix}workers" value="${name}">
                            <span class="worker-label">${name}</span>
                            ${withKtu ? `<input type="text" inputmode="decimal" class="ktu-input" name="${prefix}ktu_${name}" placeholder="КТУ" disabled>` : ''}
                            ${withArea ? `<input type="text" inputmode="decimal" class="area-input" name="${prefix}area_${name}" placeholder="Площадь (м²)" disabled>` : ''}
                            ${withAmount ? `<input type="text" inputmode="decimal" class="amount-input" name="${prefix}amount_${name}" placeholder="Сумма (₽)" disabled>` : ''}
                            `;
                            group.appendChild(label);
                            const checkbox = label.querySelector('input[type="checkbox"]');
                            if (withKtu) {
                                const ktuInput = label.querySelector('.ktu-input');
                                checkbox.addEventListener('change', () => {
                                    ktuInput.disabled = !checkbox.checked;
                                    if (!checkbox.checked) ktuInput.value = '';
                                });
                            }
                            if (withArea) {
                                const areaInput = label.querySelector('.area-input');
                                checkbox.addEventListener('change', () => {
                                    areaInput.disabled = !checkbox.checked;
                                    if (!checkbox.checked) areaInput.value = '';
                                    updateAreaDistribution(prefix);
                                });
                                areaInput.addEventListener('input', () => {
                                    updateAreaDistribution(prefix);
                                });
                            }
                            if (withAmount) {
                                const amountInput = label.querySelector('.amount-input');
                                checkbox.addEventListener('change', () => {
                                    amountInput.disabled = !checkbox.checked;
                                    if (!checkbox.checked) amountInput.value = '';
                                });
                            }
                        };

                        workersCheckboxGroup.innerHTML = '';
                        expenseWorkersCheckboxGroup.innerHTML = '';
                        expenseReceiversCheckboxGroup.innerHTML = '';
                        manualWorkersCheckboxGroup.innerHTML = '';
                        serviceWorkersCheckboxGroup.innerHTML = '';

                        workers.forEach(worker => {
                            const workerName = getWorkerName(worker);
                            createCheckbox(workerName, workersCheckboxGroup, '', true, false, true);
                            createCheckbox(workerName, expenseWorkersCheckboxGroup, 'expense', false, false, false);
                            createCheckbox(workerName, expenseReceiversCheckboxGroup, 'expenseReceivers', false, false, false);
                            createCheckbox(workerName, manualWorkersCheckboxGroup, 'manual', true, false, true);
                            createCheckbox(workerName, serviceWorkersCheckboxGroup, 'service', true, false, false);
                            // Добавляем чекбоксы для "Выданные деньги" в .checkbox-group внутри .issued-money-group
                            createCheckbox(workerName, objectForm.querySelector('.issued-money-group .checkbox-group') || document.createElement('div'), 'issued', false, true);
                            createCheckbox(workerName, expenseForm.querySelector('.issued-money-group .checkbox-group') || document.createElement('div'), 'issued', false, true);
                            createCheckbox(workerName, manualPriceForm.querySelector('.issued-money-group .checkbox-group') || document.createElement('div'), 'issued', false, true);
                            createCheckbox(workerName, customServiceForm.querySelector('.issued-money-group .checkbox-group') || document.createElement('div'), 'issued', false, true);
                        });
                        
                        // Заполняем фильтр работников
                        if (filterWorker) {
                            filterWorker.innerHTML = '<option value="all">Все работники</option>';
                            workers.forEach(worker => {
                                const workerName = getWorkerName(worker);
                                const option = document.createElement('option');
                                option.value = workerName;
                                option.textContent = workerName;
                                filterWorker.appendChild(option);
                            });
                        }
                    }

                    // Функция для обновления распределения площади
                    window.updateAreaDistribution = function(prefix) {
                        const formToUse = prefix === 'manual' ? manualPriceForm : objectForm;
                        const checkboxGroup = prefix === 'manual' ? manualWorkersCheckboxGroup : workersCheckboxGroup;
                        const warningDiv = document.getElementById(prefix === 'manual' ? 'manual-area-warning' : 'area-warning');
                        const totalAreaInput = formToUse.querySelector('input[name="area"]');
                        
                        if (!totalAreaInput || !totalAreaInput.value) {
                            if (warningDiv) warningDiv.style.display = 'none';
                            return;
                        }

                        const totalArea = parseFloat(totalAreaInput.value) || 0;
                        if (totalArea === 0) {
                            if (warningDiv) warningDiv.style.display = 'none';
                            return;
                        }

                        // Собираем площади участников
                        const checkedWorkers = Array.from(checkboxGroup.querySelectorAll('input[type="checkbox"]:checked'));
                        let distributedArea = 0;

                        checkedWorkers.forEach(checkbox => {
                            const workerName = checkbox.value;
                            const areaInput = formToUse.querySelector(`input[name="${prefix}area_${workerName}"]`);
                            if (areaInput && areaInput.value) {
                                distributedArea += parseFloat(areaInput.value) || 0;
                            }
                        });

                        const remainingArea = totalArea - distributedArea;
                        
                        if (warningDiv) {
                            if (Math.abs(remainingArea) < 0.01) {
                                warningDiv.className = 'area-warning success';
                                warningDiv.textContent = '✓ Вся площадь распределена';
                                warningDiv.style.display = 'block';
                            } else if (remainingArea > 0) {
                                warningDiv.className = 'area-warning info';
                                warningDiv.textContent = `⚠ Осталось распределить: ${remainingArea.toFixed(2)} м²`;
                                warningDiv.style.display = 'block';
                            } else {
                                warningDiv.className = 'area-warning error';
                                warningDiv.textContent = `⚠ Превышение площади на: ${Math.abs(remainingArea).toFixed(2)} м²`;
                                warningDiv.style.display = 'block';
                            }
                        }
                    };

                    // Функция для равномерного распределения площади
                    window.distributeAreaEqually = function(prefix) {
                        const formToUse = prefix === 'manual' ? manualPriceForm : objectForm;
                        const checkboxGroup = prefix === 'manual' ? manualWorkersCheckboxGroup : workersCheckboxGroup;
                        const distributeInput = document.getElementById(prefix === 'manual' ? 'manual-distribute-area-amount' : 'distribute-area-amount');
                        
                        if (!distributeInput || !distributeInput.value) {
                            alert('Введите площадь для распределения!');
                            return;
                        }

                        const areaToDistribute = parseFloat(distributeInput.value);
                        if (areaToDistribute <= 0) {
                            alert('Площадь должна быть больше нуля!');
                            return;
                        }

                        const checkedWorkers = Array.from(checkboxGroup.querySelectorAll('input[type="checkbox"]:checked'));
                        if (checkedWorkers.length === 0) {
                            alert('Выберите участников для распределения площади!');
                            return;
                        }

                        const areaPerWorker = areaToDistribute / checkedWorkers.length;
                        
                        checkedWorkers.forEach(checkbox => {
                            const workerName = checkbox.value;
                            const areaInput = formToUse.querySelector(`input[name="${prefix}area_${workerName}"]`);
                            if (areaInput) {
                                const currentArea = parseFloat(areaInput.value) || 0;
                                areaInput.value = (currentArea + areaPerWorker).toFixed(2);
                            }
                        });

                        distributeInput.value = '';
                        updateAreaDistribution(prefix);
                    };

                    function addObject(e, isExpense = false, isManual = false) {
                        e.preventDefault();
                        const formToUse = isExpense ? expenseForm : (isManual ? manualPriceForm : objectForm);
                        const isPaid = formToUse.querySelector('input[name="isPaid"]').checked;
                        // Собираем данные о выданных деньгах
                        const issuedMoney = Array.from(formToUse.querySelectorAll('.issued-money-group input[type="checkbox"]:checked')).map(checkbox => {
                            const workerName = checkbox.value;
                            const amountInput = formToUse.querySelector(`input[name="issuedamount_${workerName}"]`);
                            const amount = parseFloat(amountInput.value) || 0;
                            return amount > 0 ? { name: workerName, amount: amount.toFixed(2) } : null;
                        }).filter(item => item !== null);

                        let object;

                        if (isExpense) {
                            const expenseNameInput = formToUse.querySelector('input[name="expenseName"]');
                            const expenseName = expenseNameInput.disabled || expenseNameInput.style.display === 'none'
                            ? expenseTypeValue.value.trim()
                            : expenseNameInput.value.trim();
                            let expenseAmount;
                            const workers = Array.from(expenseWorkersCheckboxGroup.querySelectorAll('input:checked')).map(input => input.value);
                            const receivers = Array.from(expenseReceiversCheckboxGroup.querySelectorAll('input:checked')).map(input => input.value);

                            if (!expenseName || workers.length === 0) {
                                alert('Заполните все обязательные поля: выберите тип расхода или введите название и укажите участников!');
                                return;
                            }


                            if (expenseName.toLowerCase() === 'бензин' && receivers.length > 0) {
                                const fuelMode = formToUse.querySelector('input[name="fuelMode"]:checked').value;
                                const fuelConsumption = 6.7;
                                const fuelPrice = 61;

                                if (fuelMode === 'amount') {
                                    expenseAmount = parseFloat(formToUse.querySelector('input[name="expenseAmount"]').value);
                                    if (isNaN(expenseAmount) || expenseAmount >= 0) {
                                        alert('Укажите корректную отрицательную сумму расхода!');
                                        return;
                                    }
                                    object = {
                                        name: expenseName,
                                        service: 'Расход',
                                        cost: expenseAmount.toFixed(2),
                          workers,
                          receivers,
                          timestamp: new Date().toISOString(),
                          isExpense: true,
                          isPaid: isPaid,
                          issuedMoney,
                          editHistory: []
                                    };
                                } else if (fuelMode === 'distance') {
                                    const distance = parseFloat(formToUse.querySelector('input[name="distance"]').value);
                                    if (isNaN(distance) || distance <= 0) {
                                        alert('Введите корректное расстояние!');
                                        return;
                                    }
                                    const liters = (distance * fuelConsumption) / 100;
                                    expenseAmount = -(liters * fuelPrice);
                                    object = {
                                        name: expenseName,
                                        service: 'Расход',
                                        cost: expenseAmount.toFixed(2),
                          workers,
                          receivers,
                          timestamp: new Date().toISOString(),
                          isExpense: true,
                          distance: distance.toFixed(2),
                          issuedMoney,
                          editHistory: []
                                    };
                                } else if (fuelMode === 'mileage') {
                                    const startMileage = parseFloat(formToUse.querySelector('input[name="startMileage"]').value);
                                    const endMileage = parseFloat(formToUse.querySelector('input[name="endMileage"]').value);
                                    if (isNaN(startMileage) || isNaN(endMileage) || startMileage < 0 || endMileage < 0 || endMileage <= startMileage) {
                                        alert('Введите корректные значения начального и конечного километража (конечный должен быть больше начального)!');
                                        return;
                                    }
                                    const distance = endMileage - startMileage;
                                    const liters = (distance * fuelConsumption) / 100;
                                    expenseAmount = -(liters * fuelPrice);
                                    object = {
                                        name: expenseName,
                                        service: 'Расход',
                                        cost: expenseAmount.toFixed(2),
                          workers,
                          receivers,
                          timestamp: new Date().toISOString(),
                          isExpense: true,
                          startMileage: startMileage.toFixed(2),
                          endMileage: endMileage.toFixed(2),
                          distance: distance.toFixed(2),
                          issuedMoney,
                          editHistory: []
                                    };
                                }
                            } else {
                                expenseAmount = parseFloat(formToUse.querySelector('input[name="expenseAmount"]').value);
                                if (isNaN(expenseAmount) || expenseAmount >= 0) {
                                    alert('Укажите корректную отрицательную сумму расхода!');
                                    return;
                                }
                                object = {
                                    name: expenseName,
                                    service: 'Расход',
                                    cost: expenseAmount.toFixed(2),
                          workers,
                          receivers,
                          timestamp: new Date().toISOString(),
                          isExpense: true,
                          isPaid: isPaid,
                          issuedMoney,
                          editHistory: []
                                };
                            }
                        } else {
                            const objectName = (isManual ? manualObjectNameInput : objectNameInput).value.trim();
                            const length = parseFloat(formToUse.querySelector('input[name="length"]').value) || 0;
                            const width = parseFloat(formToUse.querySelector('input[name="width"]').value) || 0;
                            const areaInput = parseFloat(formToUse.querySelector('input[name="area"]').value) || 0;
                            const selectedOption = isManual ? manualSelectedValue.value : selectedValue.value;
                            const workersData = Array.from((isManual ? manualWorkersCheckboxGroup : workersCheckboxGroup).querySelectorAll('input:checked')).map(input => {
                                const ktuInput = formToUse.querySelector(`input[name="${isManual ? 'manual' : ''}ktu_${input.value}"]`);
                                const workerAreaInput = formToUse.querySelector(`input[name="${isManual ? 'manual' : ''}area_${input.value}"]`);
                                return { 
                                    name: input.value, 
                                    ktu: ktuInput.value ? parseFloat(ktuInput.value) : 1,
                                    area: workerAreaInput && workerAreaInput.value ? parseFloat(workerAreaInput.value) : null
                                };
                            });

                            let area;
                            if (areaInput > 0) {
                                area = areaInput;
                            } else if (length > 0 && width > 0) {
                                area = length * width;
                            } else {
                                alert('Укажите площадь напрямую или оба значения: длину и ширину!');
                                return;
                            }

                            if (!objectName || !selectedOption || workersData.length === 0 || workersData.some(w => w.ktu <= 0)) {
                                alert('Заполните все обязательные поля: название, услугу и участников!');
                                return;
                            }

                            let totalCost;
                            let workersWithCost;
                            const useRostikMethod = formToUse.querySelector('input[name="useRostikMethod"]').checked;

                            if (isManual) {
                                const pricePerSquare = parseFloat(manualPriceForm.querySelector('input[name="pricePerSquare"]').value);
                                if (isNaN(pricePerSquare) || pricePerSquare <= 0) {
                                    alert('Укажите корректную цену за м²!');
                                    return;
                                }
                                const [serviceName, unit] = selectedOption.split('|');
                                totalCost = (area * pricePerSquare).toFixed(2);

                                // Проверяем, есть ли хотя бы у одного участника указанная площадь
                                const hasIndividualAreas = workersData.some(w => w.area && w.area > 0);

                                if (hasIndividualAreas) {
                                    // Расчет по площади × КТУ
                                    const totalEffectiveArea = workersData.reduce((sum, w) => {
                                        const workerArea = w.area || 0;
                                        return sum + (workerArea * w.ktu);
                                    }, 0);

                                    if (totalEffectiveArea === 0) {
                                        alert('Ошибка: общая эффективная площадь не может быть нулевой!');
                                        return;
                                    }

                                    if (useRostikMethod) {
                                        // Ростиковская методика с учетом площади
                                        const numWorkers = workersData.length;
                                        let baseAmountPerWorker = parseFloat(totalCost) / numWorkers;
                                        
                                        let initialWorkersWithCost = workersData.map(w => {
                                            const workerArea = w.area || 0;
                                            const effectiveArea = workerArea * w.ktu;
                                            const workerShare = effectiveArea / totalEffectiveArea;
                                            return {
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: baseAmountPerWorker * w.ktu * workerShare * numWorkers
                                            };
                                        });

                                        const distributedAmount = initialWorkersWithCost.reduce((sum, w) => sum + w.cost, 0);
                                        const remainingAmount = parseFloat(totalCost) - distributedAmount;

                                        const workersWithKtu1 = workersData.filter(w => w.ktu === 1).length;
                                        if (workersWithKtu1 > 0 && Math.abs(remainingAmount) > 0.01) {
                                            const additionalPerKtu1Worker = remainingAmount / workersWithKtu1;
                                            workersWithCost = initialWorkersWithCost.map(w => ({
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: (w.ktu === 1 ? w.cost + additionalPerKtu1Worker : w.cost).toFixed(2)
                                            }));
                                        } else {
                                            workersWithCost = initialWorkersWithCost.map(w => ({
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: w.cost.toFixed(2)
                                            }));
                                        }
                                    } else {
                                        // Простой расчет по площади × КТУ
                                        workersWithCost = workersData.map(w => {
                                            const workerArea = w.area || 0;
                                            const effectiveArea = workerArea * w.ktu;
                                            const workerShare = effectiveArea / totalEffectiveArea;
                                            return {
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: (parseFloat(totalCost) * workerShare).toFixed(2)
                                            };
                                        });
                                    }
                                } else if (useRostikMethod) {
                                    const numWorkers = workersData.length;
                                    let baseAmountPerWorker = parseFloat(totalCost) / numWorkers;
                                    let initialWorkersWithCost = workersData.map(w => ({
                                        name: w.name,
                                        ktu: w.ktu,
                                        area: w.area,
                                        cost: baseAmountPerWorker * w.ktu
                                    }));

                                    const distributedAmount = initialWorkersWithCost.reduce((sum, w) => sum + w.cost, 0);
                                    const remainingAmount = parseFloat(totalCost) - distributedAmount;

                                    const workersWithKtu1 = workersData.filter(w => w.ktu === 1).length;
                                    if (workersWithKtu1 > 0 && remainingAmount > 0) {
                                        const additionalPerKtu1Worker = remainingAmount / workersWithKtu1;
                                        workersWithCost = initialWorkersWithCost.map(w => ({
                                            name: w.name,
                                            ktu: w.ktu,
                                            area: w.area,
                                            cost: (w.ktu === 1 ? w.cost + additionalPerKtu1Worker : w.cost).toFixed(2)
                                        }));
                                    } else {
                                        workersWithCost = initialWorkersWithCost.map(w => ({
                                            name: w.name,
                                            ktu: w.ktu,
                                            area: w.area,
                                            cost: w.cost.toFixed(2)
                                        }));
                                    }
                                } else {
                                    const totalKtu = workersData.reduce((sum, w) => sum + w.ktu, 0);
                                    const amountPerKtu = parseFloat(totalCost) / totalKtu;
                                    workersWithCost = workersData.map(w => ({
                                        name: w.name,
                                        ktu: w.ktu,
                                        area: w.area,
                                        cost: (amountPerKtu * w.ktu).toFixed(2)
                                    }));
                                }

                                object = {
                                    name: objectName,
                                    length: length > 0 ? length.toFixed(2) : null,
                          width: width > 0 ? width.toFixed(2) : null,
                          area: length > 0 && width > 0 ? `${length.toFixed(2)} x ${width.toFixed(2)} = ${area.toFixed(2)} м²` : `${area.toFixed(2)} м²`,
                          service: serviceName,
                          cost: totalCost,
                          workers: workersWithCost,
                          timestamp: new Date().toISOString(),
                          isExpense: false,
                          manualPrice: true,
                          isPaid: isPaid,
                          useRostikMethod: useRostikMethod,
                          issuedMoney,
                          editHistory: []
                                };
                            } else {
                                const [price, unit, serviceName] = selectedOption.split('|');
                                totalCost = (area * parseFloat(price)).toFixed(2);

                                // Проверяем, есть ли хотя бы у одного участника указанная площадь
                                const hasIndividualAreas = workersData.some(w => w.area && w.area > 0);

                                if (hasIndividualAreas) {
                                    // Расчет по площади × КТУ
                                    const totalEffectiveArea = workersData.reduce((sum, w) => {
                                        const workerArea = w.area || 0;
                                        return sum + (workerArea * w.ktu);
                                    }, 0);

                                    if (totalEffectiveArea === 0) {
                                        alert('Ошибка: общая эффективная площадь не может быть нулевой!');
                                        return;
                                    }

                                    if (useRostikMethod) {
                                        // Ростиковская методика с учетом площади
                                        const numWorkers = workersData.length;
                                        let baseAmountPerWorker = parseFloat(totalCost) / numWorkers;
                                        
                                        let initialWorkersWithCost = workersData.map(w => {
                                            const workerArea = w.area || 0;
                                            const effectiveArea = workerArea * w.ktu;
                                            const workerShare = effectiveArea / totalEffectiveArea;
                                            return {
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: baseAmountPerWorker * w.ktu * workerShare * numWorkers
                                            };
                                        });

                                        const distributedAmount = initialWorkersWithCost.reduce((sum, w) => sum + w.cost, 0);
                                        const remainingAmount = parseFloat(totalCost) - distributedAmount;

                                        const workersWithKtu1 = workersData.filter(w => w.ktu === 1).length;
                                        if (workersWithKtu1 > 0 && Math.abs(remainingAmount) > 0.01) {
                                            const additionalPerKtu1Worker = remainingAmount / workersWithKtu1;
                                            workersWithCost = initialWorkersWithCost.map(w => ({
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: (w.ktu === 1 ? w.cost + additionalPerKtu1Worker : w.cost).toFixed(2)
                                            }));
                                        } else {
                                            workersWithCost = initialWorkersWithCost.map(w => ({
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: w.cost.toFixed(2)
                                            }));
                                        }
                                    } else {
                                        // Простой расчет по площади × КТУ
                                        workersWithCost = workersData.map(w => {
                                            const workerArea = w.area || 0;
                                            const effectiveArea = workerArea * w.ktu;
                                            const workerShare = effectiveArea / totalEffectiveArea;
                                            return {
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: (parseFloat(totalCost) * workerShare).toFixed(2)
                                            };
                                        });
                                    }
                                } else if (useRostikMethod) {
                                    const numWorkers = workersData.length;
                                    let baseAmountPerWorker = parseFloat(totalCost) / numWorkers;
                                    let initialWorkersWithCost = workersData.map(w => ({
                                        name: w.name,
                                        ktu: w.ktu,
                                        area: w.area,
                                        cost: baseAmountPerWorker * w.ktu
                                    }));

                                    const distributedAmount = initialWorkersWithCost.reduce((sum, w) => sum + w.cost, 0);
                                    const remainingAmount = parseFloat(totalCost) - distributedAmount;

                                    const workersWithKtu1 = workersData.filter(w => w.ktu === 1).length;
                                    if (workersWithKtu1 > 0 && remainingAmount > 0) {
                                        const additionalPerKtu1Worker = remainingAmount / workersWithKtu1;
                                        workersWithCost = initialWorkersWithCost.map(w => ({
                                            name: w.name,
                                            ktu: w.ktu,
                                            area: w.area,
                                            cost: (w.ktu === 1 ? w.cost + additionalPerKtu1Worker : w.cost).toFixed(2)
                                        }));
                                    } else {
                                        workersWithCost = initialWorkersWithCost.map(w => ({
                                            name: w.name,
                                            ktu: w.ktu,
                                            area: w.area,
                                            cost: w.cost.toFixed(2)
                                        }));
                                    }
                                } else {
                                    const totalKtu = workersData.reduce((sum, w) => sum + w.ktu, 0);
                                    const amountPerKtu = parseFloat(totalCost) / totalKtu;
                                    workersWithCost = workersData.map(w => ({
                                        name: w.name,
                                        ktu: w.ktu,
                                        area: w.area,
                                        cost: (amountPerKtu * w.ktu).toFixed(2)
                                    }));
                                }

                                object = {
                                    name: objectName,
                                    length: length > 0 ? length.toFixed(2) : null,
                          width: width > 0 ? width.toFixed(2) : null,
                          area: length > 0 && width > 0 ? `${length.toFixed(2)} x ${width.toFixed(2)} = ${area.toFixed(2)} м²` : `${area.toFixed(2)} м²`,
                          service: serviceName,
                          cost: totalCost,
                          workers: workersWithCost,
                          timestamp: new Date().toISOString(),
                          isExpense: false,
                          isPaid: isPaid,
                          useRostikMethod: useRostikMethod,
                          issuedMoney,
                          editHistory: []
                                };
                            }
                        } // Добавлена закрывающая скобка для if (isExpense) { ... } else { ... }

                        window.objects.unshift(object);
                        renderObjects();
                        renderWorkerStats();
                        populateSuggestions(formToUse);
                        formToUse.reset();
                        resetFormFields(formToUse);
                        if (isExpense) {
                            expenseTypeSelect.innerHTML = 'Выберите тип расхода <span class="dropdown-icon">▾</span>';
                            expenseTypeValue.value = '';
                            toggleInputState(expenseForm, 'expenseName', expenseTypeValue);
                        } else if (isManual) {
                            manualSelectDisplay.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                            manualSelectedValue.value = '';
                        } else {
                            selectDisplay.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                            selectedValue.value = '';
                        }
                        showForm(null);
                        alert((isExpense ? 'Расход' : 'Объект') + ' добавлен.');
                    }


                    closeHistoryBtn.addEventListener('click', () => {
                        historyModal.style.display = 'none';
                    });
                    
                    const closeCommentsBtn = document.getElementById('close-comments');
                    const commentsModal = document.getElementById('comments-modal');
                    
                    closeCommentsBtn.addEventListener('click', () => {
                        commentsModal.style.display = 'none';
                    });
                    
                    // Закрытие модальных окон при клике вне их
                    window.addEventListener('click', (e) => {
                        if (e.target === commentsModal) {
                            commentsModal.style.display = 'none';
                        }
                    });

                    filterInput.addEventListener('input', () => {
                        renderObjects();
                    });

                    function populateServiceSelect(prices, display, hiddenInput, list) {
                        list.innerHTML = '';
                        prices.forEach(price => {
                            const li = document.createElement('li');
                            const value = `${price.cost}|${price.unit}|${price.name}`;
                            li.setAttribute('data-value', value);
                            li.textContent = `${price.name} — от ${price.cost} ₽/${price.unit}`;
                            li.addEventListener('click', () => {
                                display.innerHTML = `${li.textContent} <span class="dropdown-icon">▾</span>`;
                                hiddenInput.value = li.getAttribute('data-value');
                                list.classList.remove('show');
                            });
                            list.appendChild(li);
                        });
                    }

                    function populateManualServiceSelect(prices, display, hiddenInput, list, priceLabel) {
                        list.innerHTML = '';
                        prices.forEach(price => {
                            const li = document.createElement('li');
                            li.setAttribute('data-value', `${price.name}|${price.unit}`);
                            li.textContent = `${price.name} (${price.unit})`;
                            li.addEventListener('click', () => {
                                const [name, unit] = li.getAttribute('data-value').split('|');
                                display.innerHTML = `${name} (${unit}) <span class="dropdown-icon">▾</span>`;
                                hiddenInput.value = li.getAttribute('data-value');
                                priceLabel.textContent = `Цена за ${unit} (₽):`;
                                list.classList.remove('show');
                            });
                            list.appendChild(li);
                        });
                    }

                    function populateCustomServiceSelect(services) {
                        serviceOptions.innerHTML = '';
                        services.forEach(service => {
                            const li = document.createElement('li');
                            li.setAttribute('data-value', service.name);
                            li.textContent = service.name;
                            li.addEventListener('click', () => {
                                serviceSelect.innerHTML = `${li.textContent} <span class="dropdown-icon">▾</span>`;
                                serviceSelect.value = li.getAttribute('data-value');
                                toggleInputState(customServiceForm, 'serviceName', serviceSelect);
                                serviceOptions.classList.remove('show');
                            });
                            serviceOptions.appendChild(li);
                        });

                        serviceSelect.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                        serviceSelect.value = '';
                        toggleInputState(customServiceForm, 'serviceName', serviceSelect);
                    }

                    function populateExpenseTypeSelect(types) {
                        expenseTypeOptions.innerHTML = '';
                        types.forEach(type => {
                            const li = document.createElement('li');
                            li.setAttribute('data-value', type.name);
                            li.textContent = type.name;
                            li.addEventListener('click', () => {
                                expenseTypeSelect.innerHTML = `${li.textContent} <span class="dropdown-icon">▾</span>`;
                                expenseTypeValue.value = li.getAttribute('data-value');
                                toggleInputState(expenseForm, 'expenseName', expenseTypeValue);
                                expenseTypeOptions.classList.remove('show');
                            });
                            expenseTypeOptions.appendChild(li);
                        });

                        expenseTypeSelect.innerHTML = 'Выберите тип расхода <span class="dropdown-icon">▾</span>';
                        expenseTypeValue.value = '';
                        toggleInputState(expenseForm, 'expenseName', expenseTypeValue);
                    }
                    
                    // Функция применения расширенных фильтров
                    function applyAdvancedFilters(objects) {
                        if (!Array.isArray(objects)) return [];
                        return objects.filter(obj => {
                            if (!obj || typeof obj !== 'object') return false;
                            // Фильтр по поиску
                            if (advancedFilters.search) {
                                const searchMatch = (obj.name || '').toLowerCase().includes(advancedFilters.search) ||
                                    (obj.service || '').toLowerCase().includes(advancedFilters.search);
                                if (!searchMatch) return false;
                            }
                            
                            // Фильтр по периоду
                            if (advancedFilters.period !== 'all') {
                                const objDate = new Date(obj.timestamp);
                                const now = new Date();
                                
                                let startDate;
                                if (advancedFilters.period === 'custom') {
                                    if (advancedFilters.dateFrom) {
                                        startDate = new Date(advancedFilters.dateFrom);
                                        if (objDate < startDate) return false;
                                    }
                                    if (advancedFilters.dateTo) {
                                        const endDate = new Date(advancedFilters.dateTo);
                                        endDate.setHours(23, 59, 59);
                                        if (objDate > endDate) return false;
                                    }
                                } else {
                                    const dayMs = 24 * 60 * 60 * 1000;
                                    if (advancedFilters.period === 'today') {
                                        startDate = new Date(now.setHours(0, 0, 0, 0));
                                    } else if (advancedFilters.period === 'week') {
                                        startDate = new Date(now - 7 * dayMs);
                                    } else if (advancedFilters.period === 'month') {
                                        startDate = new Date(now - 30 * dayMs);
                                    } else if (advancedFilters.period === 'quarter') {
                                        startDate = new Date(now - 90 * dayMs);
                                    } else if (advancedFilters.period === 'year') {
                                        startDate = new Date(now - 365 * dayMs);
                                    }
                                    if (objDate < startDate) return false;
                                }
                            }
                            
                            // Фильтр по статусу
                            if (advancedFilters.status !== 'all') {
                                if (advancedFilters.status === 'paid' && !obj.isPaid) return false;
                                if (advancedFilters.status === 'unpaid' && obj.isPaid) return false;
                            }
                            
                            // Фильтр по типу
                            if (advancedFilters.type !== 'all') {
                                if (advancedFilters.type === 'regular' && (obj.isExpense || obj.manualPrice || obj.isCustomService)) return false;
                                if (advancedFilters.type === 'manual' && !obj.manualPrice) return false;
                                if (advancedFilters.type === 'service' && !obj.isCustomService) return false;
                                if (advancedFilters.type === 'expense' && !obj.isExpense) return false;
                            }
                            
                            // Фильтр по работнику
                            if (advancedFilters.worker !== 'all') {
                                const hasWorker = (obj.workers || []).some(w => (typeof w === 'string' ? w : w.name) === advancedFilters.worker) ||
                                    (obj.receivers && obj.receivers.includes(advancedFilters.worker));
                                if (!hasWorker) return false;
                            }
                            
                            // Фильтр по сумме
                            const objCost = Math.abs(parseFloat(obj.cost));
                            if (advancedFilters.sumFrom !== null && objCost < advancedFilters.sumFrom) return false;
                            if (advancedFilters.sumTo !== null && objCost > advancedFilters.sumTo) return false;
                            
                            return true;
                        });
                    }

                    function renderObjects() {
                        if (!Array.isArray(window.objects)) {
                            console.warn('window.objects не массив — сброшено в []');
                            window.objects = [];
                        }
                        const filterText = filterInput.value.trim().toLowerCase();
                        resultsDiv.innerHTML = '';
                        
                        // Сначала применяем расширенные фильтры
                        let filteredObjects = applyAdvancedFilters(window.objects);

                        // Затем применяем быстрый поиск, если есть
                        filteredObjects = !filterText ? filteredObjects : filteredObjects.filter(obj => {
                            if (!obj || typeof obj !== 'object') return false;
                            const workerMatch = filterText.split(' ')[0];
                            const typeMatch = filterText.replace(workerMatch, '').trim();
                            const hasWorker = (obj.workers || []).some(w => (typeof w === 'string' ? w : w.name).toLowerCase() === workerMatch) ||
                            (obj.receivers && obj.receivers.some(r => r.toLowerCase() === workerMatch)) ||
                            (obj.issuedMoney && obj.issuedMoney.some(im => im.name.toLowerCase() === workerMatch));

                            if (!hasWorker) return false;
                            if (!typeMatch) return true;

                            if (typeMatch.includes('обычных объектов')) return !obj.isExpense && !obj.manualPrice && !obj.isCustomService;
                            if (typeMatch.includes('объектов с ручной ценой')) return obj.manualPrice;
                            if (typeMatch.includes('услуги')) return obj.isCustomService;
                            if (typeMatch.includes('расходов')) return obj.isExpense;
                            if (typeMatch.includes('кту ниже нормы')) return !obj.isExpense && (obj.workers || []).some(w => w.name.toLowerCase() === workerMatch && w.ktu < 1);

                            const ts = obj.timestamp != null ? String(obj.timestamp) : '';
                            return (
                                (obj.name || '').toLowerCase().includes(filterText) ||
                                (obj.area && obj.area.toLowerCase().includes(filterText)) ||
                                (obj.service || '').toLowerCase().includes(filterText) ||
                                String(obj.cost || '').toLowerCase().includes(filterText) ||
                                (obj.workers || []).some(worker => (typeof worker === 'string' ? worker : worker.name).toLowerCase().includes(filterText)) ||
                                (obj.receivers && obj.receivers.some(receiver => receiver.toLowerCase().includes(filterText))) ||
                                (obj.issuedMoney && obj.issuedMoney.some(im => im.name.toLowerCase().includes(filterText))) ||
                                ts.toLowerCase().includes(filterText)
                            );
                        });

                        const renderableObjects = filteredObjects.filter(obj => obj && typeof obj === 'object'
                            && Array.isArray(obj.workers) && obj.workers.length > 0);
                        if (renderableObjects.length === 0) {
                            resultsDiv.innerHTML = filteredObjects.length === 0
                                ? '<p>Объектов по этому фильтру не найдено.</p>'
                                : '<p>Записи есть, но у них нет списка участников (workers) — проверьте <code>upload/save.enc.json</code> или восстановите из резервной копии.</p>';
                        } else {
                            renderableObjects.forEach((obj, index) => {
                                if (!Array.isArray(obj.editHistory)) obj.editHistory = [];
                                const receivers = Array.isArray(obj.receivers) ? obj.receivers : [];
                                let costDetailsHtml = '';
                                if (obj.isExpense) {
                                    const writeOffPerWorker = parseFloat(obj.cost) / obj.workers.length;
                                    const accrualPerReceiver = receivers.length > 0 ? Math.abs(parseFloat(obj.cost)) / receivers.length : 0;

                                    const writeOffDetails = obj.workers.map(worker => {
                                        const workerName = typeof worker === 'string' ? worker : worker.name;
                                        return `<span class="worker-item">${getWorkerIcon(workerName)}${workerName}: ${writeOffPerWorker.toFixed(2)} ₽</span>`;
                                    }).join('');

                                    const accrualDetails = receivers.length > 0
                                    ? receivers.map(receiver => {
                                        return `<span class="worker-item">${getWorkerIcon(receiver)}${receiver}: ${accrualPerReceiver.toFixed(2)} ₽</span>`;
                                    }).join('')
                                    : '';

                                    costDetailsHtml = `
                                    <div class="info-line cost-per-worker"><span class="label">Списание:</span><span class="value write-off">${writeOffDetails}</span></div>
                                    ${accrualDetails ? `<div class="info-line cost-per-receiver"><span class="label">Начисление:</span><span class="value accrual">${accrualDetails}</span></div>` : ''}
                                    `;
                                } else {
                                    const costPerWorker = obj.workers.map(w => {
                                        return `<span class="worker-item">${getWorkerIcon(w.name)}${w.name}: ${w.cost} ₽ (КТУ ${w.ktu}${w.area ? `, ${w.area} м²` : ''})</span>`;
                                    }).join('');
                                    costDetailsHtml = `<div class="info-line cost-per-worker"><span class="label">Распределение:</span><span class="value">${costPerWorker}</span></div>`;
                                }

                                let issuedMoneyHtml = '';
                                if (obj.issuedMoney && obj.issuedMoney.length > 0) {
                                    const issuedMoneyDetails = obj.issuedMoney.map(im => {
                                        return `<span class="worker-item">${getWorkerIcon(im.name)}${im.name}: ${im.amount} ₽</span>`;
                                    }).join('');
                                    issuedMoneyHtml = `<div class="info-line issued-money"><span class="label">Выданные деньги:</span><span class="value">${issuedMoneyDetails}</span></div>`;
                                }

                                let imageUrl = null;
                                if (obj.isExpense) {
                                    if (obj.name.toLowerCase() === 'бензин') {
                                        if (receivers.length === 1 && receivers.includes('Коля')) imageUrl = calcUrl('img/nexia.png');
                                        else if (receivers.length === 1 && receivers.includes('Артём')) imageUrl = calcUrl('img/ford.png');
                                        else imageUrl = calcUrl('img/fuel.png');
                                    } else if (obj.name.toLowerCase() === 'съёмная квартира') {
                                        imageUrl = calcUrl('img/house.png');
                                    } else if (obj.name.toLowerCase() === 'еда') {
                                        imageUrl = calcUrl('img/eat.png');
                                    } else if (obj.name.toLowerCase() === 'займ') {
                                        imageUrl = calcUrl('img/money.png');
                                    }
                                } else if (obj.isCustomService) {
                                    switch (obj.service) {
                                        case 'Электросварка перил и лестниц на кровле':
                                            imageUrl = calcUrl('img/lestnica.png');
                                            break;
                                        case 'Погрузо-разгрузочные работы':
                                            imageUrl = calcUrl('img/pogruzka.png');
                                            break;
                                        case 'Уборка территории':
                                            imageUrl = calcUrl('img/cleaning.png');
                                            break;
                                    }
                                } else {
                                    const priceEntry = prices.find(p => p.name === obj.service);
                                    if (priceEntry && priceEntry.image) {
                                        imageUrl = priceEntry.image;
                                    }
                                }
                                if (imageUrl) imageUrl = resolveStaticUrl(imageUrl);

                                console.log(`Object: ${obj.name}, Service: ${obj.service}, imageUrl: ${imageUrl}`);

                                let costFormula = `${obj.cost} ₽`;
                                if (obj.isExpense && obj.name.toLowerCase() === 'бензин' && receivers.length > 0) {
                                    const fuelConsumption = 6.7;
                                    const fuelPrice = 61;
                                    if (obj.distance && !obj.startMileage) {
                                        const distance = parseFloat(obj.distance);
                                        const liters = (distance * fuelConsumption) / 100;
                                        costFormula = `${distance} км × ${fuelConsumption} л/100 км ÷ 100 × ${fuelPrice} ₽/л = ${liters.toFixed(2)} л × ${fuelPrice} ₽/л = ${obj.cost} ₽`;
                                    } else if (obj.startMileage && obj.endMileage) {
                                        const start = parseFloat(obj.startMileage);
                                        const end = parseFloat(obj.endMileage);
                                        const distance = parseFloat(obj.distance);
                                        const liters = (distance * fuelConsumption) / 100;
                                        costFormula = `(${end} км - ${start} км) × ${fuelConsumption} л/100 км ÷ 100 × ${fuelPrice} ₽/л = ${liters.toFixed(2)} л × ${fuelPrice} ₽/л = ${obj.cost} ₽`;
                                    }
                                }

                                const entry = document.createElement('div');
                                entry.className = `calculation ${obj.isExpense ? 'expense' : ''} ${obj.manualPrice ? 'manual-price' : ''} ${obj.isCustomService ? 'custom-service' : ''} ${editMode ? 'editable' : ''}`;
                                entry.dataset.timestamp = obj.timestamp; // Используем timestamp как уникальный идентификатор
                                const areaMatch = obj.area ? obj.area.match(/([\d.]+)\s*x\s*([\d.]+)\s*=\s*([\d.]+)\s*м²/) || obj.area.match(/([\d.]+)\s*м²/) : null;
                                const areaValue = areaMatch ? parseFloat(areaMatch[areaMatch.length === 4 ? 3 : 1]) : 0;
                                const pricePerSquare = areaValue > 0 ? (parseFloat(obj.cost) / areaValue).toFixed(2) : null;

                                let editedTimestampHtml = '';
                                if (obj.editedTimestamp) {
                                    editedTimestampHtml = `Последнее редактирование: ${obj.editedTimestamp}`;
                                    if (obj.useRostikMethod) {
                                        editedTimestampHtml += ' <span style="color: #555;">(Ростиковская методика)</span>';
                                    }
                                }

                                entry.innerHTML = `
                                <div class="overviewInfo">
                                    <div class="actions">
                                        ${obj.editHistory.length > 0 ? `<button class="action-button neurobutton calendar-btn" data-timestamp="${obj.timestamp}">📅 <span class="edit-count">${obj.editHistory.length}</span></button>` : ''}
                                        <button class="action-button neurobutton copy-btn" data-timestamp="${obj.timestamp}">📋</button>
                                        <button class="action-button neurobutton btn-comments" data-timestamp="${obj.timestamp}">💬 ${obj.comments && obj.comments.length > 0 ? `<span class="comments-badge">${obj.comments.length}</span>` : ''}</button>
                                        <button class="action-button neurobutton paid-btn ${obj.isPaid ? 'paid' : ''}" data-timestamp="${obj.timestamp}">${obj.isPaid ? `<svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block"><circle cx="12" cy="12" r="9" style="fill:none;stroke:white;stroke-width:2"/><path d="M8 12.5l2.5 2.5L16 9" style="fill:none;stroke:white;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"/></svg>` : `<svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block"><circle cx="12" cy="12" r="9" style="fill:none;stroke:white;stroke-width:2"/><path d="M8 8l8 8M16 8l-8 8" style="fill:none;stroke:white;stroke-width:2;stroke-linecap:round"/></svg>`}</button>
                                        ${editMode ? `<span class="action-button neurobutton delete-cross" data-timestamp="${obj.timestamp}">✕</span>` : ''}
                                    </div>
                                    <div class="productinfo">
                                        <div class="grouptext">
                                            <h3>${obj.area ? 'ПЛОЩАДЬ' : (obj.distance ? 'РАССТОЯНИЕ' : 'ДАТА')}</h3>
                                            <p>${obj.area ? areaValue.toFixed(2) + ' м²' : (obj.distance ? obj.distance + ' км' : parseDateSafe(obj.timestamp).toLocaleDateString('ru-RU'))}</p>
                                        </div>
                                        <div class="grouptext">
                                            <h3>СТАТУС</h3>
                                            <p>${obj.isPaid ? 'Оплачено' : 'Ожидание'}</p>
                                        </div>
                                        <div class="grouptext">
                                            <h3>${pricePerSquare ? 'Цена Кв.м.' : 'СУММА'}</h3>
                                            <p>${pricePerSquare ? (pricePerSquare + ' ₽/м²') : (parseFloat(obj.cost).toFixed(0) + ' ₽')}</p>
                                        </div>
                                        ${imageUrl ? `<div class="productImage"><img src="${imageUrl}" alt="${obj.service}"></div>` : ''}
                                    </div>
                                </div>
                                <div class="productSpecifications">
                                    ${!obj.isExpense && !obj.manualPrice && !obj.isCustomService && obj.name ? `<div class="object-name-label">${obj.name}</div>` : ''}
                                    <h1>${obj.isExpense ? obj.name : obj.service}</h1>
                                    ${obj.isExpense ? '<div class="productFeatures">' + obj.workers.map(worker => {
                                        const workerName = typeof worker === 'string' ? worker : worker.name;
                                        const writeOffPerWorker = parseFloat(obj.cost) / obj.workers.length;
                                        return `<div class="feature">
                                            <div class="featureIcon">${getWorkerIcon(workerName)}</div>
                                            <div class="featureText">
                                                <p><strong>${workerName}</strong></p>
                                                <p>Списание: ${writeOffPerWorker.toFixed(2)} ₽</p>
                                            </div>
                                        </div>`;
                                    }).join('') + '</div>' : '<div class="productFeatures">' + obj.workers.map(w => {
                                        return `<div class="feature">
                                            <div class="featureIcon">${getWorkerIcon(w.name)}</div>
                                            <div class="featureText">
                                                <p><strong>${w.name}</strong></p>
                                                <p>${w.cost} ₽ (КТУ ${w.ktu}${w.area ? `, ${w.area} м²` : ''})</p>
                                            </div>
                                        </div>`;
                                    }).join('') + '</div>'}
                                    ${receivers.length > 0 ? '<div class="productFeatures" style="margin-top: 16px;"><h3 style="grid-column: 1/-1; color: #30cfd0; font-size: 14px; margin-bottom: 8px;">НАЧИСЛЕНИЕ</h3>' + receivers.map(receiver => {
                                        const accrualPerReceiver = Math.abs(parseFloat(obj.cost)) / receivers.length;
                                        return `<div class="feature">
                                            <div class="featureIcon">${getWorkerIcon(receiver)}</div>
                                            <div class="featureText">
                                                <p><strong>${receiver}</strong></p>
                                                <p>+${accrualPerReceiver.toFixed(2)} ₽</p>
                                            </div>
                                        </div>`;
                                    }).join('') + '</div>' : ''}
                                    ${obj.issuedMoney && obj.issuedMoney.length > 0 ? '<div class="productFeatures" style="margin-top: 16px;"><h3 style="grid-column: 1/-1; color: #fa709a; font-size: 14px; margin-bottom: 8px;">ВЫДАННЫЕ ДЕНЬГИ</h3>' + obj.issuedMoney.map(im => {
                                        return `<div class="feature">
                                            <div class="featureIcon">${getWorkerIcon(im.name)}</div>
                                            <div class="featureText">
                                                <p><strong>${im.name}</strong></p>
                                                <p>${im.amount} ₽</p>
                                            </div>
                                        </div>`;
                                    }).join('') + '</div>' : ''}
                                    <div class="checkoutButton">
                                        <div class="priceTag">${parseFloat(obj.cost).toFixed(2)} ₽</div>
                                    </div>
                                    ${editedTimestampHtml ? `<p style="font-size: 11px; opacity: 0.5; margin-top: 12px;">${editedTimestampHtml}</p>` : (obj.useRostikMethod ? `<p style="font-size: 11px; opacity: 0.5; margin-top: 12px;">(Ростиковская методика)</p>` : '')}
                                </div>
                                `;
                                        if (editMode) {
                                            entry.addEventListener('click', (e) => {
                                                if (!e.target.classList.contains('delete-cross') && 
                                                    !e.target.classList.contains('calendar-btn') && 
                                                    !e.target.classList.contains('copy-btn') && 
                                                    !e.target.classList.contains('paid-btn') && 
                                                    !e.target.classList.contains('btn-comments') && 
                                                    !e.target.classList.contains('comments-badge') &&
                                                    !e.target.classList.contains('action-button') &&
                                                    !e.target.closest('.action-button') &&
                                                    !e.target.closest('.checkoutButton')) {
                                                    const objIndex = window.objects.findIndex(o => o.timestamp === obj.timestamp);
                                                    editObject(objIndex);
                                                }
                                            });
                                        }
                                        resultsDiv.appendChild(entry);
                            });

                            bindCopyButtons();
                            bindPaidButtons();
                            bindDeleteCrosses();
                            bindCalendarButtons();
                            bindCommentsButtons();
                        }
                    }

                    function bindCopyButtons() {
                        // Используем делегирование событий на resultsDiv для надежности
                        // Удаляем старый обработчик если есть
                        resultsDiv.removeEventListener('click', copyButtonDelegate);
                        // Добавляем новый обработчик с делегированием
                        resultsDiv.addEventListener('click', copyButtonDelegate);
                    }
                    
                    function copyButtonDelegate(e) {
                        const copyBtn = e.target.closest('.copy-btn');
                        if (copyBtn) {
                            handleCopy(e);
                        }
                    }

                    function handleCopy(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        const btn = e.target.closest('.copy-btn');
                        if (!btn) {
                            console.error('Кнопка копирования не найдена');
                            return;
                        }
                        const timestamp = btn.getAttribute('data-timestamp');
                        if (!timestamp) {
                            console.error('data-timestamp не найден');
                            return;
                        }
                        const card = resultsDiv.querySelector(`.calculation[data-timestamp="${timestamp}"]`);
                        if (!card) {
                            console.error(`Карточка с timestamp ${timestamp} не найдена`);
                            return;
                        }

                        // Собираем данные из новой структуры карточки
                        const lines = [];
                        
                        // Название/Услуга
                        const title = card.querySelector('.productSpecifications h1')?.textContent || '';
                        if (title) lines.push(title);
                        
                        // Данные из productinfo (grouptext)
                        const grouptexts = card.querySelectorAll('.productinfo .grouptext');
                        grouptexts.forEach(gt => {
                            const label = gt.querySelector('h3')?.textContent || '';
                            const value = gt.querySelector('p')?.textContent || '';
                            if (label && value) {
                                lines.push(`${label}: ${value}`);
                            }
                        });
                        
                        // Участники и другие разделы из productFeatures
                        const productFeaturesSections = card.querySelectorAll('.productFeatures');
                        productFeaturesSections.forEach(section => {
                            const sectionTitle = section.querySelector('h3')?.textContent || 'Участники';
                            const features = section.querySelectorAll('.feature');
                            if (features.length > 0) {
                                lines.push(sectionTitle);
                                features.forEach(feature => {
                                    const name = feature.querySelector('.featureText p strong')?.textContent || '';
                                    const allP = feature.querySelectorAll('.featureText p');
                                    const detailsP = Array.from(allP).find(p => !p.querySelector('strong'));
                                    const details = detailsP?.textContent || '';
                                    if (name && details) {
                                        lines.push(`  ${name}: ${details}`);
                                    }
                                });
                            }
                        });
                        
                        // Общая сумма
                        const priceTag = card.querySelector('.priceTag')?.textContent || '';
                        if (priceTag) {
                            lines.push(`Сумма: ${priceTag}`);
                        }
                        
                        // Дата редактирования
                        const editTimestamp = card.querySelector('.productSpecifications p')?.textContent || '';
                        if (editTimestamp && editTimestamp.includes('редактирование')) {
                            lines.push(editTimestamp);
                        }
                        
                        const textToCopy = lines.join('\n').trim();
                        
                        if (!textToCopy) {
                            console.error('Не удалось собрать текст для копирования');
                            return;
                        }

                        if (navigator.clipboard && window.isSecureContext) {
                            navigator.clipboard.writeText(textToCopy)
                            .then(() => {
                                console.log('Текст успешно скопирован в буфер обмена');
                                // Визуальная обратная связь
                                btn.style.opacity = '0.5';
                                setTimeout(() => { btn.style.opacity = '1'; }, 200);
                            })
                            .catch(err => {
                                console.error('Ошибка при копировании: ', err);
                                fallbackCopy(textToCopy);
                            });
                        } else {
                            fallbackCopy(textToCopy);
                        }
                    }

                    function fallbackCopy(text) {
                        const textArea = document.createElement('textarea');
                        textArea.value = text;
                        textArea.style.position = 'fixed';
                        textArea.style.opacity = '0';
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();

                        try {
                            document.execCommand('copy');
                        } finally {
                            document.body.removeChild(textArea);
                        }
                    }

                    function bindPaidButtons() {
                        document.querySelectorAll('.paid-btn').forEach(btn => {
                            btn.removeEventListener('click', handlePaidToggle);
                            btn.addEventListener('click', handlePaidToggle);
                        });
                    }

                    function handlePaidToggle(e) {
                        e.stopPropagation();
                        const btn = e.currentTarget;
                        const timestamp = btn.getAttribute('data-timestamp');
                        const index = window.objects.findIndex(obj => obj.timestamp === timestamp);
                        if (index === -1) {
                            console.error(`Объект с timestamp "${timestamp}" не найден`);
                            return;
                        }
                        const obj = window.objects[index];
                        obj.isPaid = !obj.isPaid;
                        btn.innerHTML = obj.isPaid
                            ? `<svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block"><circle cx="12" cy="12" r="9" style="fill:none;stroke:white;stroke-width:2"/><path d="M8 12.5l2.5 2.5L16 9" style="fill:none;stroke:white;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"/></svg>`
                            : `<svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block"><circle cx="12" cy="12" r="9" style="fill:none;stroke:white;stroke-width:2"/><path d="M8 8l8 8M16 8l-8 8" style="fill:none;stroke:white;stroke-width:2;stroke-linecap:round"/></svg>`;
                        btn.classList.toggle('paid', obj.isPaid);
                        // Update status text in the card without full re-render
                        const card = document.querySelector(`.calculation[data-timestamp="${timestamp}"]`);
                        if (card) {
                            const statusBlocks = card.querySelectorAll('.productinfo .grouptext');
                            statusBlocks.forEach(block => {
                                const h3 = block.querySelector('h3');
                                const p = block.querySelector('p');
                                if (h3 && p && h3.textContent.trim() === 'СТАТУС') {
                                    p.textContent = obj.isPaid ? 'Оплачено' : 'Ожидание';
                                }
                            });
                        }
                        renderWorkerStats();
                    }

                    function bindDeleteCrosses() {
                        document.querySelectorAll('.delete-cross').forEach(cross => {
                            cross.removeEventListener('click', handleDelete);
                            cross.addEventListener('click', handleDelete);
                        });
                    }

                    function handleDelete(e) {
                        e.stopPropagation(); // Предотвращаем всплытие события к карточке
                        const timestamp = e.target.getAttribute('data-timestamp');
                        const index = window.objects.findIndex(obj => obj.timestamp === timestamp);
                        if (index === -1) {
                            console.error(`Объект с timestamp "${timestamp}" не найден`);
                            return;
                        }
                        if (confirm(`Удалить "${window.objects[index].isExpense ? 'расход' : 'объект'} "${window.objects[index].name}"?`)) {
                            window.objects.splice(index, 1);
                            renderObjects();
                            renderWorkerStats();
                            populateSuggestions(objectForm);
                        }
                    }

                    function bindCalendarButtons() {
                        document.querySelectorAll('.calendar-btn').forEach(btn => {
                            btn.removeEventListener('click', showHistory);
                            btn.addEventListener('click', showHistory);
                        });
                    }
                    
                    function bindCommentsButtons() {
                        document.querySelectorAll('.btn-comments').forEach(btn => {
                            btn.removeEventListener('click', showComments);
                            btn.addEventListener('click', showComments);
                        });
                    }
                    
                    function showComments(e) {
                        e.stopPropagation();
                        const timestamp = e.target.closest('.btn-comments').getAttribute('data-timestamp');
                        const obj = window.objects.find(o => o.timestamp === timestamp);
                        if (!obj) return;
                        
                        // Инициализируем массив комментариев, если его нет
                        if (!obj.comments) obj.comments = [];
                        
                        const commentsModal = document.getElementById('comments-modal');
                        const commentsList = document.getElementById('comments-list');
                        const newCommentText = document.getElementById('new-comment-text');
                        const addCommentBtn = document.getElementById('add-comment-btn');
                        
                        // Отображаем существующие комментарии
                        commentsList.innerHTML = '';
                        if (obj.comments.length === 0) {
                            commentsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Комментариев пока нет</p>';
                        } else {
                            obj.comments.forEach((comment, index) => {
                                const commentDiv = document.createElement('div');
                                commentDiv.className = 'comment-item';
                                commentDiv.innerHTML = `
                                    <div class="comment-header">
                                        <span class="comment-author">Пользователь</span>
                                        <span class="comment-date">${comment.timestamp}</span>
                                        ${editMode ? `<button class="delete-comment-btn" data-index="${index}">✕</button>` : ''}
                                    </div>
                                    <div class="comment-text">${comment.text}</div>
                                `;
                                commentsList.appendChild(commentDiv);
                            });
                            
                            // Добавляем обработчики удаления - будет обработано в updateCommentsList
                            if (editMode) {
                                commentsList.querySelectorAll('.delete-comment-btn').forEach(btn => {
                                    btn.addEventListener('click', function() {
                                        const index = parseInt(this.getAttribute('data-index'));
                                        if (confirm('Удалить комментарий?')) {
                                            obj.comments.splice(index, 1);
                                            saveData();
                                            showComments({ target: e.target, stopPropagation: () => {} });
                                            renderObjects();
                                        }
                                    });
                                });
                            }
                        }
                        
                        // Функция для обновления списка комментариев
                        const updateCommentsList = () => {
                            commentsList.innerHTML = '';
                            if (obj.comments.length === 0) {
                                commentsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Комментариев пока нет</p>';
                            } else {
                                obj.comments.forEach((comment, index) => {
                                    const commentDiv = document.createElement('div');
                                    commentDiv.className = 'comment-item';
                                    commentDiv.innerHTML = `
                                        <div class="comment-header">
                                            <span class="comment-author">Пользователь</span>
                                            <span class="comment-date">${comment.timestamp}</span>
                                            ${editMode ? `<button class="delete-comment-btn" data-index="${index}">✕</button>` : ''}
                                        </div>
                                        <div class="comment-text">${comment.text}</div>
                                    `;
                                    commentsList.appendChild(commentDiv);
                                });
                                
                                // Привязываем обработчики удаления
                                if (editMode) {
                                    commentsList.querySelectorAll('.delete-comment-btn').forEach(btn => {
                                        btn.addEventListener('click', function() {
                                            const idx = parseInt(this.getAttribute('data-index'));
                                            if (confirm('Удалить комментарий?')) {
                                                obj.comments.splice(idx, 1);
                                                saveData();
                                                updateCommentsList();
                                                renderObjects();
                                            }
                                        });
                                    });
                                }
                            }
                        };
                        
                        // Обработчик добавления комментария
                        addCommentBtn.onclick = () => {
                            const text = newCommentText.value.trim();
                            if (!text) return;
                            
                            obj.comments.push({
                                text: text,
                                timestamp: new Date().toISOString()
                            });
                            
                            saveData();
                            newCommentText.value = '';
                            updateCommentsList();
                            renderObjects();
                        };
                        
                        // Инициализируем список комментариев при открытии
                        updateCommentsList();
                        commentsModal.style.display = 'flex';
                    }

                    function showHistory(e) {
                        e.stopPropagation();
                        const timestamp = e.target.closest('.calendar-btn').getAttribute('data-timestamp');
                        const obj = window.objects.find(o => o.timestamp === timestamp);
                        if (!obj) return;

                        historyList.innerHTML = '';

                        const originalEntry = document.createElement('div');
                        originalEntry.className = 'history-entry';
                        originalEntry.innerHTML = `
                        <strong>Исходная версия</strong> (${obj.timestamp})<br>
                        ${renderObjectDetails(getOriginalObject(obj))}
                        `;
                        originalEntry.addEventListener('click', () => {
                            renderTemporaryObject(timestamp, null);
                            historyModal.style.display = 'none';
                        });
                        historyList.appendChild(originalEntry);

                        obj.editHistory.forEach((history, hIndex) => {
                            const entry = document.createElement('div');
                            entry.className = 'history-entry';
                            entry.innerHTML = `
                            <strong>${history.timestamp}</strong><br>
                            <div class="info-line"><span class="label">Изменения:</span><span class="value">${history.changes}</span></div>
                            `;
                            entry.addEventListener('click', () => {
                                renderTemporaryObject(timestamp, hIndex);
                                historyModal.style.display = 'none';
                            });
                            historyList.appendChild(entry);
                        });

                        historyModal.style.display = 'flex';
                    }

                    function getOriginalObject(obj) {
                        return { ...obj, editHistory: [], editedTimestamp: null };
                    }

                    function getObjectAtHistory(obj, hIndex) {
                        let result = getOriginalObject(obj);
                        for (let i = 0; i <= hIndex; i++) {
                            const changes = obj.editHistory[i].changes.split(', ');
                            changes.forEach(change => {
                                const [field, oldValue, newValue] = change.match(/(.+?): "(.+?)" → "(.+?)"/) || [];
                                if (field) {
                                    if (field === 'Название') result.name = newValue;
                                    if (field === 'Площадь') result.area = newValue;
                                    if (field === 'Услуга') result.service = newValue;
                                    if (field === 'Стоимость') result.cost = newValue;
                                    if (field === 'Участники') {
                                        const workers = newValue.split(', ').map(w => {
                                            const [name, ktuCost] = w.split(' (КТУ ');
                                            const ktu = parseFloat(ktuCost?.replace(')', ''));
                                            const cost = result.workers.find(w => w.name === name)?.cost || '0.00';
                                            return { name, ktu: ktu || 1, cost };
                                        });
                                        result.workers = workers;
                                    }
                                    if (field === 'Участники (списание)') result.workers = newValue.split(', ');
                                    if (field === 'Участники (начисление)') result.receivers = newValue.split(', ');
                                }
                            });
                            result.editedTimestamp = obj.editHistory[i].timestamp;
                        }
                        return result;
                    }

                    function renderTemporaryObject(timestamp, hIndex) {
                        const obj = window.objects.find(o => o.timestamp === timestamp);
                        if (!obj) return;

                        const tempObj = hIndex === null ? obj : getObjectAtHistory(obj, hIndex);
                        const entry = resultsDiv.querySelector(`[data-timestamp="${timestamp}"]`);
                        if (!entry) return;

                        const costPerWorker = tempObj.isExpense
                            ? tempObj.workers.map(worker => {
                                const workerName = typeof worker === 'string' ? worker : worker.name;
                                const perWorkerAmount = (parseFloat(tempObj.cost) / tempObj.workers.length).toFixed(2);
                                return `<span class="worker-item">${getWorkerIcon(workerName)}${workerName}: ${perWorkerAmount} ₽</span>`;
                            }).join('')
                            : tempObj.workers.map(w => `<span class="worker-item">${getWorkerIcon(w.name)}${w.name}: ${w.cost} ₽ (КТУ ${w.ktu}${w.area ? `, ${w.area} м²` : ''})</span>`).join('');
                        const costPerReceiver = tempObj.isExpense && tempObj.receivers.length > 0
                            ? tempObj.receivers.map(receiver => {
                                const perReceiverAmount = (Math.abs(parseFloat(tempObj.cost)) / tempObj.receivers.length).toFixed(2);
                                return `<span class="worker-item">${getWorkerIcon(receiver)}${receiver}: ${perReceiverAmount} ₽</span>`;
                            }).join('')
                            : '';
                        
                        const workersDisplayList = tempObj.isExpense 
                            ? tempObj.workers.map(worker => {
                                const workerName = typeof worker === 'string' ? worker : worker.name;
                                return `<span class="worker-item">${getWorkerIcon(workerName)}${workerName}</span>`;
                            }).join('')
                            : tempObj.workers.map(w => `<span class="worker-item">${getWorkerIcon(w.name)}${w.name} (КТУ ${w.ktu}${w.area ? `, ${w.area} м²` : ''})</span>`).join('');
                        
                        const receiversDisplayList = tempObj.isExpense && tempObj.receivers.length > 0
                            ? tempObj.receivers.map(receiver => `<span class="worker-item">${getWorkerIcon(receiver)}${receiver}</span>`).join('')
                            : '';

                        entry.innerHTML = `
                        <div class="header-line">
                            <strong>•</strong>
                            <span class="timestamp">(${tempObj.timestamp})</span>
                            ${tempObj.editHistory.length > 0 ? `<button class="calendar-btn" data-timestamp="${tempObj.timestamp}">📅 <span class="edit-count">${tempObj.editHistory.length}</span></button>` : ''}
                            ${editMode ? `<span class="delete-cross" data-timestamp="${tempObj.timestamp}">✕</span>` : ''}
                        </div>
                        ${tempObj.area ? `<div class="info-line area"><span class="label">Площадь:</span><span class="value">${tempObj.area}</span></div>` : ''}
                        <div class="info-line service"><span class="label">Услуга:</span><span class="value">${tempObj.service}</span></div>
                        <div class="info-line cost"><span class="label">Стоимость:</span><span class="value">${tempObj.cost} ₽</span></div>
                        <div class="info-line workers"><span class="label">${tempObj.isExpense ? 'Участники (списание)' : 'Участники'}:</span><span class="value">${workersDisplayList}</span></div>
                        ${receiversDisplayList ? `<div class="info-line receivers"><span class="label">Участники (начисление):</span><span class="value">${receiversDisplayList}</span></div>` : ''}
                        <div class="info-line cost-per-worker"><span class="label">${tempObj.isExpense ? 'На одного (списание)' : 'Распределение'}:</span><span class="value">${costPerWorker}</span></div>
                        ${costPerReceiver ? `<div class="info-line cost-per-receiver"><span class="label">На одного (начисление):</span><span class="value">${costPerReceiver}</span></div>` : ''}
                        ${tempObj.editedTimestamp ? `<div class="edit-history">Последнее редактирование: ${tempObj.editedTimestamp}</div>` : ''}
                        `;
                        bindCalendarButtons();
                    }

                    function editObject(index) {
                        const obj = window.objects[index];
                        const isExpense = obj.isExpense;
                        const isCustomService = obj.isCustomService;
                        const formToUse = isExpense ? expenseForm : (isCustomService ? customServiceForm : (obj.manualPrice ? manualPriceForm : objectForm));

                        showForm(formToUse);

                        // Добавляем прокрутку к форме
                        const y = formToUse.getBoundingClientRect().top + window.scrollY;
                        window.scrollTo({ top: y - 15, behavior: 'smooth' });

                        const submitBtn = formToUse.querySelector('button[type="submit"]');
                        const cancelBtn = formToUse.querySelector('.cancel-btn');

                        submitBtn.textContent = 'Изменить ' + (isExpense ? 'расход' : (isCustomService ? 'услугу' : 'объект'));
                        cancelBtn.style.display = 'inline-block';
                        formToUse.dataset.isEditing = 'true';
                        formToUse.dataset.editIndex = index;

                        formToUse.querySelector('input[name="isPaid"]').checked = obj.isPaid || false;

                        // Нормализованные списки имен из объекта (участники/получатели)
                        const objWorkerNames = Array.isArray(obj.workers) ? obj.workers.map(w => (typeof w === 'string' ? w : w.name)) : [];
                        const objReceiverNames = Array.isArray(obj.receivers) ? obj.receivers.map(r => (typeof r === 'string' ? r : r.name)) : [];

                        // Заполняем поле "Выданные деньги"
                        workers.forEach(worker => {
                            const workerName = getWorkerName(worker);
                            const checkbox = formToUse.querySelector(`.issued-money-group input[value="${workerName}"]`);
                            const amountInput = formToUse.querySelector(`input[name="issuedamount_${workerName}"]`);
                            if (checkbox && amountInput) {
                                const issued = obj.issuedMoney && obj.issuedMoney.find(im => im.name === workerName);
                                checkbox.checked = !!issued;
                                amountInput.disabled = !issued;
                                amountInput.value = issued ? issued.amount : '';
                            }
                        });

                        if (isExpense) {
                            expenseNameInput.value = obj.name;
                            expenseForm.querySelector('input[name="expenseAmount"]').value = obj.cost;
                            expenseTypeSelect.innerHTML = `${obj.name} <span class="dropdown-icon">▾</span>`;
                            expenseTypeValue.value = obj.name;
                            toggleInputState(expenseForm, 'expenseName', expenseTypeValue);
                            workers.forEach(worker => {
                                const workerName = getWorkerName(worker);
                                const checkbox = expenseWorkersCheckboxGroup.querySelector(`input[value="${workerName}"]`);
                                if (checkbox) checkbox.checked = objWorkerNames.includes(workerName);
                                const receiverCheckbox = expenseReceiversCheckboxGroup.querySelector(`input[value="${workerName}"]`);
                                if (receiverCheckbox) receiverCheckbox.checked = objReceiverNames.includes(workerName);
                            });
                                if (obj.name.toLowerCase() === 'бензин' && objReceiverNames.length === 1 && objReceiverNames[0] === 'Артём') {
                                    formToUse.querySelector('input[name="fuelMode"][value="amount"]').checked = true;
                                    formToUse.querySelector('input[name="distance"]').value = '';
                                }
                        } else if (isCustomService) {
                            serviceNameInput.value = obj.name;
                            customServiceForm.querySelector('input[name="servicePrice"]').value = obj.cost;
                            serviceSelect.innerHTML = `${obj.name} <span class="dropdown-icon">▾</span>`;
                            serviceSelect.value = obj.name;
                            toggleInputState(customServiceForm, 'serviceName', serviceSelect);
                            workers.forEach(worker => {
                                const workerName = getWorkerName(worker);
                                const checkbox = serviceWorkersCheckboxGroup.querySelector(`input[value="${workerName}"]`);
                                if (checkbox) {
                                    checkbox.checked = objWorkerNames.includes(workerName);
                                    const ktuInput = checkbox.parentElement.querySelector(`input[name="servicektu_${workerName}"]`);
                                    if (ktuInput) {
                                        const wObj = Array.isArray(obj.workers) && obj.workers.find(w => (typeof w === 'string' ? w === workerName : w.name === workerName));
                                        ktuInput.value = (wObj && typeof wObj === 'object' && wObj.ktu) ? parseFloat(wObj.ktu) : 1;
                                        ktuInput.disabled = !checkbox.checked;
                                    }
                                }
                            });
                            const rostikMethodCheckbox = customServiceForm.querySelector('input[name="useRostikMethod"]');
                            if (rostikMethodCheckbox) {
                                rostikMethodCheckbox.checked = obj.useRostikMethod || false;
                            }
                        } else {
                            const input = obj.manualPrice ? manualObjectNameInput : objectNameInput;
                            input.value = obj.name;

                            const areaMatch = obj.area && (obj.area.match(/([\d.]+)\s*x\s*([\d.]+)\s*=\s*([\d.]+)\s*м²/) || obj.area.match(/([\d.]+)\s*м²/));
                            if (areaMatch) {
                                if (areaMatch.length === 4) {
                                    formToUse.querySelector('input[name="length"]').value = parseFloat(areaMatch[1]);
                                    formToUse.querySelector('input[name="width"]').value = parseFloat(areaMatch[2]);
                                    formToUse.querySelector('input[name="area"]').value = '';
                                    formToUse.querySelector('input[name="area"]').disabled = true;
                                } else {
                                    formToUse.querySelector('input[name="area"]').value = parseFloat(areaMatch[1]);
                                    formToUse.querySelector('input[name="length"]').value = '';
                                    formToUse.querySelector('input[name="width"]').value = '';
                                    formToUse.querySelector('input[name="length"]').disabled = true;
                                    formToUse.querySelector('input[name="width"]').disabled = true;
                                }
                            }

                            if (obj.manualPrice) {
                                manualSelectedValue.value = `${obj.service}|м²`;
                                manualSelectDisplay.innerHTML = `${obj.service} (м²) <span class="dropdown-icon">▾</span>`;
                                const area = areaMatch ? parseFloat(areaMatch[areaMatch.length === 4 ? 3 : 1]) : 0;
                                const pricePerSquare = area > 0 ? (parseFloat(obj.cost) / area) : 0;
                                const pps = isFinite(pricePerSquare) ? pricePerSquare.toFixed(2) : '';
                                manualPriceForm.querySelector('input[name="pricePerSquare"]').value = pps;
                            } else {
                                const area = areaMatch ? parseFloat(areaMatch[areaMatch.length === 4 ? 3 : 1]) : 0;
                                const pricePerSquare = area > 0 ? (parseFloat(obj.cost) / area) : 0;
                                const pps = isFinite(pricePerSquare) ? pricePerSquare.toFixed(2) : '';
                                selectedValue.value = pps ? `${pps}|м²|${obj.service}` : '';
                                selectDisplay.innerHTML = `${obj.service}${pps ? ` — от ${pps} ₽/м²` : ''} <span class="dropdown-icon">▾</span>`;
                            }

                            workers.forEach(worker => {
                                const workerName = getWorkerName(worker);
                                const checkbox = (obj.manualPrice ? manualWorkersCheckboxGroup : workersCheckboxGroup).querySelector(`input[value="${workerName}"]`);
                                if (checkbox) {
                                    checkbox.checked = objWorkerNames.includes(workerName);
                                    const ktuInput = checkbox.parentElement.querySelector(`input[name="${obj.manualPrice ? 'manual' : ''}ktu_${workerName}"]`);
                                    if (ktuInput) {
                                        const wObj = Array.isArray(obj.workers) && obj.workers.find(w => (typeof w === 'string' ? w === workerName : w.name === workerName));
                                        ktuInput.value = (wObj && typeof wObj === 'object' && wObj.ktu) ? parseFloat(wObj.ktu) : 1;
                                        ktuInput.disabled = !checkbox.checked;
                                    }
                                    const areaInput = checkbox.parentElement.querySelector(`input[name="${obj.manualPrice ? 'manual' : ''}area_${workerName}"]`);
                                    if (areaInput) {
                                        const wObj = Array.isArray(obj.workers) && obj.workers.find(w => (typeof w === 'string' ? w === workerName : w.name === workerName));
                                        areaInput.value = (wObj && typeof wObj === 'object' && wObj.area) ? wObj.area : '';
                                        areaInput.disabled = !checkbox.checked;
                                    }
                                }
                            });
                            
                            // Обновляем отображение распределения площади
                            updateAreaDistribution(obj.manualPrice ? 'manual' : '');

                            const rostikMethodCheckbox = formToUse.querySelector('input[name="useRostikMethod"]');
                            if (rostikMethodCheckbox) {
                                rostikMethodCheckbox.checked = obj.useRostikMethod || false;
                            }
                        }

                        cancelBtn.onclick = () => {
                            formToUse.reset();
                            resetFormFields(formToUse);
                            formToUse.dataset.isEditing = 'false';
                            formToUse.dataset.editIndex = '';
                            submitBtn.textContent = isExpense ? 'Добавить расход' : (isCustomService ? 'Добавить услугу' : 'Добавить объект');
                            cancelBtn.style.display = 'none';

                            if (isExpense) {
                                expenseTypeSelect.innerHTML = 'Выберите тип расхода <span class="dropdown-icon">▾</span>';
                                expenseTypeValue.value = '';
                                toggleInputState(formToUse, 'expenseName', expenseTypeValue);
                            } else if (isCustomService) {
                                serviceSelect.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                                serviceSelect.value = '';
                                toggleInputState(formToUse, 'serviceName', serviceSelect);
                            } else if (obj.manualPrice) {
                                manualSelectDisplay.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                                manualSelectedValue.value = '';
                            } else {
                                selectDisplay.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                                selectedValue.value = '';
                            }

                            formToUse.onsubmit = isExpense ?
                                (e) => addObject(e, true) :
                                (isCustomService ?
                                customServiceForm.onsubmit :
                                (obj.manualPrice ? (e) => addObject(e, false, true) : (e) => addObject(e)));

                            showForm(null);
                        };

                        formToUse.onsubmit = (e) => {
                            e.preventDefault();
                            const index = parseInt(formToUse.dataset.editIndex);
                            const oldObj = window.objects[index];
                            const changes = [];
                            const newIsPaid = formToUse.querySelector('input[name="isPaid"]').checked;

                            // Собираем новые данные о выданных деньгах
                            const newIssuedMoney = Array.from(formToUse.querySelectorAll('.issued-money-group input[type="checkbox"]:checked')).map(checkbox => {
                                const workerName = checkbox.value;
                                const amountInput = formToUse.querySelector(`input[name="issuedamount_${workerName}"]`);
                                const amount = parseFloat(amountInput.value) || 0;
                                return amount > 0 ? { name: workerName, amount: amount.toFixed(2) } : null;
                            }).filter(item => item !== null);

                            // Проверяем изменения в "Выданные деньги"
                            const oldIssuedMoneyStr = oldObj.issuedMoney ? oldObj.issuedMoney.map(im => `${im.name}: ${im.amount}`).join(', ') : 'Нет';
                            const newIssuedMoneyStr = newIssuedMoney.length > 0 ? newIssuedMoney.map(im => `${im.name}: ${im.amount}`).join(', ') : 'Нет';
                            if (oldIssuedMoneyStr !== newIssuedMoneyStr) {
                                changes.push(`Выданные деньги: "${oldIssuedMoneyStr}" → "${newIssuedMoneyStr}"`);
                            }

                            if (isExpense) {
                                const newName = expenseNameInput.disabled ? expenseTypeValue.value : expenseNameInput.value.trim();
                                let newAmount;
                                const newWorkers = Array.from(expenseWorkersCheckboxGroup.querySelectorAll('input:checked')).map(input => input.value);
                                const newReceivers = Array.from(expenseReceiversCheckboxGroup.querySelectorAll('input:checked')).map(input => input.value);

                                if (!newName || newWorkers.length === 0) {
                                    alert('Заполните все обязательные поля: название и участников!');
                                    return;
                                }

                                if (newName.toLowerCase() === 'бензин' && newReceivers.length === 1 && newReceivers[0] === 'Артём') {
                                    const fuelMode = formToUse.querySelector('input[name="fuelMode"]:checked').value;
                                    if (fuelMode === 'amount') {
                                        newAmount = parseFloat(formToUse.querySelector('input[name="expenseAmount"]').value);
                                        if (isNaN(newAmount) || newAmount >= 0) {
                                            alert('Укажите корректную отрицательную сумму расхода!');
                                            return;
                                        }
                                    } else {
                                        const distance = parseFloat(formToUse.querySelector('input[name="distance"]').value);
                                        if (isNaN(distance) || distance <= 0) {
                                            alert('Введите корректное расстояние!');
                                            return;
                                        }
                                        const fuelConsumption = 6.7;
                                        const fuelPrice = 61;
                                        const liters = (distance * fuelConsumption) / 100;
                                        newAmount = -(liters * fuelPrice);
                                    }
                                } else {
                                    newAmount = parseFloat(formToUse.querySelector('input[name="expenseAmount"]').value);
                                    if (isNaN(newAmount) || newAmount >= 0) {
                                        alert('Укажите корректную отрицательную сумму расхода!');
                                        return;
                                    }
                                }

                                if (newName !== oldObj.name) changes.push(`Название: "${oldObj.name}" → "${newName}"`);
                                if (newAmount !== parseFloat(oldObj.cost)) changes.push(`Сумма: ${oldObj.cost} → ${newAmount}`);
                                if (JSON.stringify(newWorkers) !== JSON.stringify(oldObj.workers)) changes.push(`Участники (списание): "${oldObj.workers.join(', ')}" → "${newWorkers.join(', ')}"`);
                                if (JSON.stringify(newReceivers) !== JSON.stringify(oldObj.receivers)) changes.push(`Участники (начисление): "${oldObj.receivers.join(', ')}" → "${newReceivers.join(', ')}"`);
                                if (newIsPaid !== oldObj.isPaid) changes.push(`Статус выплаты: "${oldObj.isPaid ? 'Выплачено' : 'Не выплачено'}" → "${newIsPaid ? 'Выплачено' : 'Не выплачено'}"`);

                                oldObj.name = newName;
                                oldObj.cost = newAmount.toFixed(2);
                                oldObj.workers = newWorkers;
                                oldObj.receivers = newReceivers;
                                oldObj.isPaid = newIsPaid;
                                oldObj.issuedMoney = newIssuedMoney;
                            } else if (isCustomService) {
                                const newName = serviceNameInput.disabled ? serviceSelect.value : serviceNameInput.value.trim();
                                const newCost = parseFloat(customServiceForm.querySelector('input[name="servicePrice"]').value);
                                const newWorkers = Array.from(serviceWorkersCheckboxGroup.querySelectorAll('input:checked')).map(input => {
                                    const ktuInput = customServiceForm.querySelector(`input[name="servicektu_${input.value}"]`);
                                    return { name: input.value, ktu: ktuInput.value ? parseFloat(ktuInput.value) : 1 };
                                });

                                if (!newName || isNaN(newCost) || newCost <= 0 || newWorkers.length === 0 || newWorkers.some(w => w.ktu <= 0)) {
                                    alert('Заполните все поля корректно!');
                                    return;
                                }

                                const totalKtu = newWorkers.reduce((sum, w) => sum + w.ktu, 0);
                                const workersWithCost = newWorkers.map(w => ({ name: w.name, ktu: w.ktu, cost: (newCost * w.ktu / totalKtu).toFixed(2) }));

                                if (newName !== oldObj.name) changes.push(`Название: "${oldObj.name}" → "${newName}"`);
                                if (newCost !== parseFloat(oldObj.cost)) changes.push(`Стоимость: ${oldObj.cost} → ${newCost}`);
                                if (JSON.stringify(newWorkers) !== JSON.stringify(oldObj.workers)) changes.push(`Участники: "${oldObj.workers.map(w => `${w.name} (КТУ ${w.ktu})`).join(', ')}" → "${newWorkers.map(w => `${w.name} (КТУ ${w.ktu})`).join(', ')}"`);
                                if (newIsPaid !== oldObj.isPaid) changes.push(`Статус выплаты: "${oldObj.isPaid ? 'Выплачено' : 'Не выплачено'}" → "${newIsPaid ? 'Выплачено' : 'Не выплачено'}"`);

                                oldObj.name = newName;
                                oldObj.service = newName;
                                oldObj.cost = newCost.toFixed(2);
                                oldObj.workers = workersWithCost;
                                oldObj.isPaid = newIsPaid;
                                oldObj.issuedMoney = newIssuedMoney;
                            } else {
                                const newName = (obj.manualPrice ? manualObjectNameInput : objectNameInput).value.trim();
                                const length = parseFloat(formToUse.querySelector('input[name="length"]').value) || 0;
                                const width = parseFloat(formToUse.querySelector('input[name="width"]').value) || 0;
                                const areaInput = parseFloat(formToUse.querySelector('input[name="area"]').value) || 0;
                                const newWorkers = Array.from((obj.manualPrice ? manualWorkersCheckboxGroup : workersCheckboxGroup).querySelectorAll('input:checked')).map(input => {
                                    const ktuInput = formToUse.querySelector(`input[name="${obj.manualPrice ? 'manual' : ''}ktu_${input.value}"]`);
                                    const workerAreaInput = formToUse.querySelector(`input[name="${obj.manualPrice ? 'manual' : ''}area_${input.value}"]`);
                                    return { 
                                        name: input.value, 
                                        ktu: ktuInput.value ? parseFloat(ktuInput.value) : 1,
                                        area: workerAreaInput && workerAreaInput.value ? parseFloat(workerAreaInput.value) : null
                                    };
                                });

                                let newArea;
                                if (areaInput > 0) {
                                    newArea = areaInput;
                                } else if (length > 0 && width > 0) {
                                    newArea = length * width;
                                } else {
                                    alert('Укажите площадь напрямую или оба значения: длину и ширину!');
                                    return;
                                }

                                if (!newName || newWorkers.length === 0 || newWorkers.some(w => w.ktu <= 0)) {
                                    alert('Заполните все обязательные поля: название, услугу и участников!');
                                    return;
                                }

                                let newCost;
                                let newWorkersWithCost;
                                const newUseRostikMethod = formToUse.querySelector('input[name="useRostikMethod"]').checked;

                                // Проверяем, есть ли хотя бы у одного участника указанная площадь
                                const hasIndividualAreas = newWorkers.some(w => w.area && w.area > 0);

                                if (obj.manualPrice) {
                                    const pricePerSquare = parseFloat(formToUse.querySelector('input[name="pricePerSquare"]').value);
                                    if (isNaN(pricePerSquare) || pricePerSquare <= 0) {
                                        alert('Укажите корректную цену за м²!');
                                        return;
                                    }
                                    newCost = (newArea * pricePerSquare).toFixed(2);

                                    if (hasIndividualAreas) {
                                        // Расчет по площади × КТУ
                                        const totalEffectiveArea = newWorkers.reduce((sum, w) => {
                                            const workerArea = w.area || 0;
                                            return sum + (workerArea * w.ktu);
                                        }, 0);

                                        if (totalEffectiveArea === 0) {
                                            alert('Ошибка: общая эффективная площадь не может быть нулевой!');
                                            return;
                                        }

                                        if (newUseRostikMethod) {
                                            // Ростиковская методика с учетом площади
                                            const numWorkers = newWorkers.length;
                                            let baseAmountPerWorker = parseFloat(newCost) / numWorkers;
                                            
                                            let initialWorkersWithCost = newWorkers.map(w => {
                                                const workerArea = w.area || 0;
                                                const effectiveArea = workerArea * w.ktu;
                                                const workerShare = effectiveArea / totalEffectiveArea;
                                                return {
                                                    name: w.name,
                                                    ktu: w.ktu,
                                                    area: w.area,
                                                    cost: baseAmountPerWorker * w.ktu * workerShare * numWorkers
                                                };
                                            });

                                            const distributedAmount = initialWorkersWithCost.reduce((sum, w) => sum + w.cost, 0);
                                            const remainingAmount = parseFloat(newCost) - distributedAmount;

                                            const workersWithKtu1 = newWorkers.filter(w => w.ktu === 1).length;
                                            if (workersWithKtu1 > 0 && Math.abs(remainingAmount) > 0.01) {
                                                const additionalPerKtu1Worker = remainingAmount / workersWithKtu1;
                                                newWorkersWithCost = initialWorkersWithCost.map(w => ({
                                                    name: w.name,
                                                    ktu: w.ktu,
                                                    area: w.area,
                                                    cost: (w.ktu === 1 ? w.cost + additionalPerKtu1Worker : w.cost).toFixed(2)
                                                }));
                                            } else {
                                                newWorkersWithCost = initialWorkersWithCost.map(w => ({
                                                    name: w.name,
                                                    ktu: w.ktu,
                                                    area: w.area,
                                                    cost: w.cost.toFixed(2)
                                                }));
                                            }
                                        } else {
                                            // Простой расчет по площади × КТУ
                                            newWorkersWithCost = newWorkers.map(w => {
                                                const workerArea = w.area || 0;
                                                const effectiveArea = workerArea * w.ktu;
                                                const workerShare = effectiveArea / totalEffectiveArea;
                                                return {
                                                    name: w.name,
                                                    ktu: w.ktu,
                                                    area: w.area,
                                                    cost: (parseFloat(newCost) * workerShare).toFixed(2)
                                                };
                                            });
                                        }
                                    } else if (newUseRostikMethod) {
                                        const numWorkers = newWorkers.length;
                                        let baseAmountPerWorker = parseFloat(newCost) / numWorkers;
                                        let initialWorkersWithCost = newWorkers.map(w => ({
                                            name: w.name,
                                            ktu: w.ktu,
                                            area: w.area,
                                            cost: baseAmountPerWorker * w.ktu
                                        }));

                                        const distributedAmount = initialWorkersWithCost.reduce((sum, w) => sum + w.cost, 0);
                                        const remainingAmount = parseFloat(newCost) - distributedAmount;

                                        const workersWithKtu1 = newWorkers.filter(w => w.ktu === 1).length;
                                        if (workersWithKtu1 > 0 && remainingAmount > 0) {
                                            const additionalPerKtu1Worker = remainingAmount / workersWithKtu1;
                                            newWorkersWithCost = initialWorkersWithCost.map(w => ({
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: (w.ktu === 1 ? w.cost + additionalPerKtu1Worker : w.cost).toFixed(2)
                                            }));
                                        } else {
                                            newWorkersWithCost = initialWorkersWithCost.map(w => ({
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: w.cost.toFixed(2)
                                            }));
                                        }
                                    } else {
                                        const totalKtu = newWorkers.reduce((sum, w) => sum + w.ktu, 0);
                                        const amountPerKtu = parseFloat(newCost) / totalKtu;
                                        newWorkersWithCost = newWorkers.map(w => ({
                                            name: w.name,
                                            ktu: w.ktu,
                                            area: w.area,
                                            cost: (amountPerKtu * w.ktu).toFixed(2)
                                        }));
                                    }
                                } else {
                                    const [price, unit, serviceName] = selectedValue.value.split('|');
                                    newCost = (newArea * parseFloat(price)).toFixed(2);

                                    if (hasIndividualAreas) {
                                        // Расчет по площади × КТУ
                                        const totalEffectiveArea = newWorkers.reduce((sum, w) => {
                                            const workerArea = w.area || 0;
                                            return sum + (workerArea * w.ktu);
                                        }, 0);

                                        if (totalEffectiveArea === 0) {
                                            alert('Ошибка: общая эффективная площадь не может быть нулевой!');
                                            return;
                                        }

                                        if (newUseRostikMethod) {
                                            // Ростиковская методика с учетом площади
                                            const numWorkers = newWorkers.length;
                                            let baseAmountPerWorker = parseFloat(newCost) / numWorkers;
                                            
                                            let initialWorkersWithCost = newWorkers.map(w => {
                                                const workerArea = w.area || 0;
                                                const effectiveArea = workerArea * w.ktu;
                                                const workerShare = effectiveArea / totalEffectiveArea;
                                                return {
                                                    name: w.name,
                                                    ktu: w.ktu,
                                                    area: w.area,
                                                    cost: baseAmountPerWorker * w.ktu * workerShare * numWorkers
                                                };
                                            });

                                            const distributedAmount = initialWorkersWithCost.reduce((sum, w) => sum + w.cost, 0);
                                            const remainingAmount = parseFloat(newCost) - distributedAmount;

                                            const workersWithKtu1 = newWorkers.filter(w => w.ktu === 1).length;
                                            if (workersWithKtu1 > 0 && Math.abs(remainingAmount) > 0.01) {
                                                const additionalPerKtu1Worker = remainingAmount / workersWithKtu1;
                                                newWorkersWithCost = initialWorkersWithCost.map(w => ({
                                                    name: w.name,
                                                    ktu: w.ktu,
                                                    area: w.area,
                                                    cost: (w.ktu === 1 ? w.cost + additionalPerKtu1Worker : w.cost).toFixed(2)
                                                }));
                                            } else {
                                                newWorkersWithCost = initialWorkersWithCost.map(w => ({
                                                    name: w.name,
                                                    ktu: w.ktu,
                                                    area: w.area,
                                                    cost: w.cost.toFixed(2)
                                                }));
                                            }
                                        } else {
                                            // Простой расчет по площади × КТУ
                                            newWorkersWithCost = newWorkers.map(w => {
                                                const workerArea = w.area || 0;
                                                const effectiveArea = workerArea * w.ktu;
                                                const workerShare = effectiveArea / totalEffectiveArea;
                                                return {
                                                    name: w.name,
                                                    ktu: w.ktu,
                                                    area: w.area,
                                                    cost: (parseFloat(newCost) * workerShare).toFixed(2)
                                                };
                                            });
                                        }
                                    } else if (newUseRostikMethod) {
                                        const numWorkers = newWorkers.length;
                                        let baseAmountPerWorker = parseFloat(newCost) / numWorkers;
                                        let initialWorkersWithCost = newWorkers.map(w => ({
                                            name: w.name,
                                            ktu: w.ktu,
                                            area: w.area,
                                            cost: baseAmountPerWorker * w.ktu
                                        }));

                                        const distributedAmount = initialWorkersWithCost.reduce((sum, w) => sum + w.cost, 0);
                                        const remainingAmount = parseFloat(newCost) - distributedAmount;

                                        const workersWithKtu1 = newWorkers.filter(w => w.ktu === 1).length;
                                        if (workersWithKtu1 > 0 && remainingAmount > 0) {
                                            const additionalPerKtu1Worker = remainingAmount / workersWithKtu1;
                                            newWorkersWithCost = initialWorkersWithCost.map(w => ({
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: (w.ktu === 1 ? w.cost + additionalPerKtu1Worker : w.cost).toFixed(2)
                                            }));
                                        } else {
                                            newWorkersWithCost = initialWorkersWithCost.map(w => ({
                                                name: w.name,
                                                ktu: w.ktu,
                                                area: w.area,
                                                cost: w.cost.toFixed(2)
                                            }));
                                        }
                                    } else {
                                        const totalKtu = newWorkers.reduce((sum, w) => sum + w.ktu, 0);
                                        const amountPerKtu = parseFloat(newCost) / totalKtu;
                                        newWorkersWithCost = newWorkers.map(w => ({
                                            name: w.name,
                                            ktu: w.ktu,
                                            area: w.area,
                                            cost: (amountPerKtu * w.ktu).toFixed(2)
                                        }));
                                    }
                                }

                                const newAreaString = length > 0 && width > 0 ? `${length.toFixed(2)} x ${width.toFixed(2)} = ${newArea.toFixed(2)} м²` : `${newArea.toFixed(2)} м²`;

                                if (newName !== oldObj.name) changes.push(`Название: "${oldObj.name}" → "${newName}"`);
                                if (newAreaString !== oldObj.area) changes.push(`Площадь: "${oldObj.area}" → "${newAreaString}"`);
                                if (obj.manualPrice) {
                                    const newPricePerSquare = (parseFloat(newCost) / newArea).toFixed(2);
                                    const oldPricePerSquare = (parseFloat(oldObj.cost) / parseFloat(oldObj.area.match(/([\d.]+)\s*м²/)[1])).toFixed(2);
                                    if (newPricePerSquare !== oldPricePerSquare) changes.push(`Цена за м²: ${oldPricePerSquare} → ${newPricePerSquare}`);
                                } else {
                                    if (selectedValue.value !== oldObj.service) changes.push(`Услуга: "${oldObj.service}" → "${selectedValue.value.split('|')[2]}"`);
                                }
                                if (JSON.stringify(newWorkers) !== JSON.stringify(oldObj.workers)) changes.push(`Участники: "${oldObj.workers.map(w => `${w.name} (КТУ ${w.ktu})`).join(', ')}" → "${newWorkers.map(w => `${w.name} (КТУ ${w.ktu})`).join(', ')}"`);
                                if (newCost !== oldObj.cost) changes.push(`Стоимость: ${oldObj.cost} → ${newCost}`);
                                if (newIsPaid !== oldObj.isPaid) changes.push(`Статус выплаты: "${oldObj.isPaid ? 'Выплачено' : 'Не выплачено'}" → "${newIsPaid ? 'Выплачено' : 'Не выплачено'}"`);
                                if (newUseRostikMethod !== oldObj.useRostikMethod) changes.push(`Методика: "${oldObj.useRostikMethod ? 'Ростиковская' : 'Стандартная'}" → "${newUseRostikMethod ? 'Ростиковская' : 'Стандартная'}"`);

                                oldObj.name = newName;
                                oldObj.area = newAreaString;
                                oldObj.length = length > 0 ? length.toFixed(2) : null;
                                oldObj.width = width > 0 ? width.toFixed(2) : null;
                                oldObj.cost = newCost;
                                oldObj.workers = newWorkersWithCost;
                                oldObj.isPaid = newIsPaid;
                                if (!obj.manualPrice) {
                                    oldObj.service = selectedValue.value.split('|')[2];
                                }
                                oldObj.useRostikMethod = newUseRostikMethod;
                                oldObj.issuedMoney = newIssuedMoney;
                            }

                            if (changes.length > 0) {
                                oldObj.editedTimestamp = new Date().toISOString();
                                oldObj.editHistory.push({ timestamp: oldObj.editedTimestamp, changes: changes.join(', ') });
                            }

                            renderObjects();
                            renderWorkerStats();
                            populateSuggestions(formToUse);
                            formToUse.reset();
                            resetFormFields(formToUse);
                            formToUse.dataset.isEditing = 'false';
                            formToUse.dataset.editIndex = '';
                            submitBtn.textContent = isExpense ? 'Добавить расход' : (isCustomService ? 'Добавить услугу' : 'Добавить объект');
                            cancelBtn.style.display = 'none';

                            if (isExpense) {
                                expenseTypeSelect.innerHTML = 'Выберите тип расхода <span class="dropdown-icon">▾</span>';
                                expenseTypeValue.value = '';
                                toggleInputState(formToUse, 'expenseName', expenseTypeValue);
                            } else if (isCustomService) {
                                serviceSelect.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                                serviceSelect.value = '';
                                toggleInputState(formToUse, 'serviceName', serviceSelect);
                            } else if (obj.manualPrice) {
                                manualSelectDisplay.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                                manualSelectedValue.value = '';
                            } else {
                                selectDisplay.innerHTML = 'Выберите услугу <span class="dropdown-icon">▾</span>';
                                selectedValue.value = '';
                            }

                            showForm(null);
                            alert((isExpense ? 'Расход' : (isCustomService ? 'Услуга' : 'Объект')) + ' изменён.');
                        };
                    }

                    // Отрисовка статистики работников
                    function renderWorkerStats() {
                        const statsGrid = document.getElementById('worker-stats');
                        if (!statsGrid) return;
                        statsGrid.innerHTML = '';

                        const getWorkerName = (w) => typeof w === 'string' ? w : (w && w.name ? w.name : '');

                        // Общий пул процентов с работников (для отображения карточек бригадиров без участия в объектах)
                        let globalForemanPool = 0;
                        window.objects.filter(obj => !obj.isExpense && !obj.isPaid).forEach(obj => {
                            (obj.workers || []).forEach(w => {
                                const currentWorkerName = getWorkerName(w);
                                if (isForeman(currentWorkerName)) return;
                                if (!shouldWorkerPayForemanPercentage(currentWorkerName)) return;
                                const workerPercent = getWorkerPercentage(currentWorkerName);
                                if (workerPercent <= 0) return;
                                const workerEarning = parseFloat(w.cost);
                                if (!Number.isFinite(workerEarning) || workerEarning <= 0) return;
                                globalForemanPool += (workerEarning * workerPercent / 100);
                            });
                        });

                        workers.forEach(worker => {
                            const workerName = getWorkerName(worker);
                            const workerObjects = window.objects.filter(obj =>
                            (!obj.isExpense || (obj.isExpense && !obj.isPaid)) &&
                            ((obj.workers && obj.workers.some(w => getWorkerName(w) === workerName)) ||
                            (obj.receivers && obj.receivers.includes(workerName)) ||
                            (obj.issuedMoney && obj.issuedMoney.some(im => im.name === workerName)))
                            );

                            // Показываем карточку если есть объекты ИЛИ бригадир с долей общего пула процентов
                            const isForemanWithPoolShare = isForeman(workerName) && globalForemanPool > 0;
                            if (workerObjects.length === 0 && !isForemanWithPoolShare) return;

                            const regularObjects = workerObjects.filter(obj => !obj.isExpense && !obj.manualPrice && !obj.isCustomService).length;
                            const manualObjects = workerObjects.filter(obj => obj.manualPrice).length;
                            const services = workerObjects.filter(obj => obj.isCustomService).length;
                            const expenses = workerObjects.filter(obj => obj.isExpense).length;

                            const incomeObjects = workerObjects.filter(obj => !obj.isExpense);
                            const expenseObjects = workerObjects.filter(obj => obj.isExpense);

                            const incomeBreakdown = incomeObjects.map((obj) => {
                                const workerData = obj.workers.find(w => getWorkerName(w) === workerName);
                                const contribution = workerData ? parseFloat(workerData.cost) : 0;
                                const className = obj.isCustomService ? 'service-earning' : 'regular-earning';
                                return { value: contribution.toFixed(2), timestamp: obj.timestamp, className, isPaid: obj.isPaid };
                            });
                            const paidIncome = incomeBreakdown.filter(e => e.isPaid);
                            const pendingIncome = incomeBreakdown.filter(e => !e.isPaid);
                            const totalPaidIncome = paidIncome.reduce((sum, val) => sum + parseFloat(val.value), 0);
                            const totalPendingIncome = pendingIncome.reduce((sum, val) => sum + parseFloat(val.value), 0);

                            const issuedMoneyBreakdown = workerObjects
                            .filter(obj => !obj.isPaid && obj.issuedMoney && obj.issuedMoney.some(im => im.name === workerName))
                            .map((obj) => {
                                const issued = obj.issuedMoney.find(im => im.name === workerName);
                                return issued ? { value: (-parseFloat(issued.amount)).toFixed(2), timestamp: obj.timestamp, className: 'issued-money-negative' } : null;
                            })
                            .filter(item => item !== null);
                            const totalIssuedMoney = issuedMoneyBreakdown.reduce((sum, val) => sum + parseFloat(val.value), 0);

                            const expenseBreakdownByReceiver = {};
                            const debtsOwedToWorker = {};

                            expenseObjects.forEach((obj) => {
                                const totalCost = parseFloat(obj.cost) || 0;
                                if (isNaN(totalCost)) return;
                                const workersCount = obj.workers.length || 1;
                                const writeOffPerWorker = totalCost / workersCount;
                                const receiversCount = obj.receivers.length || 1;
                                const accrualPerReceiver = receiversCount > 0 ? Math.abs(totalCost) / receiversCount : 0;

                                if (obj.workers.some(w => getWorkerName(w) === workerName)) {
                                    if (obj.receivers.length > 0) {
                                        obj.receivers.forEach(receiver => {
                                            if (receiver !== workerName) {
                                                if (!expenseBreakdownByReceiver[receiver]) expenseBreakdownByReceiver[receiver] = [];
                                                const isLoan = obj.name.toLowerCase() === 'займ';
                                                const safeReceiversCount = Array.isArray(obj.receivers) && obj.receivers.length > 0 ? obj.receivers.length : 1;
                                                const debtValue = (isLoan
                                                ? (-Math.abs(writeOffPerWorker) / safeReceiversCount)
                                                : (writeOffPerWorker / safeReceiversCount)).toFixed(2);

                                                expenseBreakdownByReceiver[receiver].push({
                                                    value: debtValue,
                                                    timestamp: obj.timestamp,
                                                    className: 'expense-earning'
                                                });
                                            }
                                        });
                                    } else {
                                        const anonymousReceiver = 'БОСС';
                                        if (!expenseBreakdownByReceiver[anonymousReceiver]) expenseBreakdownByReceiver[anonymousReceiver] = [];
                                        const debtValue = writeOffPerWorker.toFixed(2);
                                        expenseBreakdownByReceiver[anonymousReceiver].push({
                                            value: debtValue,
                                            timestamp: obj.timestamp,
                                            className: 'expense-earning'
                                        });
                                    }
                                }

                                if (obj.receivers.includes(workerName)) {
                                    if (obj.workers.length > 0) {
                                        obj.workers.forEach(debtor => {
                                            const debtorName = getWorkerName(debtor);
                                            if (debtorName !== workerName) {
                                                if (!debtsOwedToWorker[debtorName]) debtsOwedToWorker[debtorName] = [];
                                                const isLoan = obj.name.toLowerCase() === 'займ';
                                                const safeReceiversCount = Array.isArray(obj.receivers) && obj.receivers.length > 0 ? obj.receivers.length : 1;
                                                const creditValue = (isLoan
                                                ? (Math.abs(writeOffPerWorker) / safeReceiversCount)
                                                : (Math.abs(writeOffPerWorker) / safeReceiversCount)).toFixed(2);
                                                debtsOwedToWorker[debtorName].push({
                                                    value: creditValue,
                                                    timestamp: obj.timestamp,
                                                    className: 'receiver-earning'
                                                });
                                            }
                                        });
                                    } else {
                                        const anonymousDebtor = 'БОСС';
                                        if (!debtsOwedToWorker[anonymousDebtor]) debtsOwedToWorker[anonymousDebtor] = [];
                                        const creditValue = accrualPerReceiver.toFixed(2);
                                        debtsOwedToWorker[anonymousDebtor].push({
                                            value: creditValue,
                                            timestamp: obj.timestamp,
                                            className: 'receiver-earning'
                                        });
                                    }
                                }
                            });

                            const allDebts = {};
                            Object.entries(debtsOwedToWorker).forEach(([debtor, debts]) => {
                                if (!allDebts[debtor]) allDebts[debtor] = [];
                                allDebts[debtor].push(...debts.map(debt => ({ ...debt, value: parseFloat(debt.value) })));
                            });

                            Object.entries(expenseBreakdownByReceiver).forEach(([receiver, debts]) => {
                                if (!allDebts[receiver]) allDebts[receiver] = [];
                                allDebts[receiver].push(...debts.map(debt => ({ ...debt, value: parseFloat(debt.value) })));
                            });

                            Object.keys(allDebts).forEach(person => {
                                allDebts[person].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                            });

                            const debtBalances = {};
                            Object.entries(allDebts).forEach(([person, debts]) => {
                                debtBalances[person] = debts.reduce((sum, debt) => sum + debt.value, 0).toFixed(2);
                            });

                            const totalDebtsOwedToWorker = Object.values(debtBalances)
                            .filter(balance => parseFloat(balance) > 0)
                            .reduce((sum, balance) => sum + parseFloat(balance), 0);
                            const totalExpenses = Object.values(debtBalances)
                            .filter(balance => parseFloat(balance) < 0)
                            .reduce((sum, balance) => sum + parseFloat(balance), 0);

                            const totalPendingWithIssued = totalPendingIncome + totalIssuedMoney;
                            
                            // Рассчитываем проценты для текущего работника
                            // Логика: удерживаем % с каждого работника в общий пул,
                            // затем пул делим поровну между всеми бригадирами.
                            let percentageDeductions = 0;
                            let percentageEarnings = 0;
                            const foremenCount = workers.filter(w => isForeman(getWorkerName(w))).length;
                            const totalForemanPool = globalForemanPool;
                            
                            // Если текущий работник - обычный работник, вычитаем его % в общий пул
                            if (!isForeman(workerName)) {
                                incomeObjects.filter(obj => !obj.isPaid).forEach(obj => {
                                    const workerData = obj.workers.find(w => getWorkerName(w) === workerName);
                                    if (workerData) {
                                        if (!shouldWorkerPayForemanPercentage(workerName)) return;
                                        const workerPercent = getWorkerPercentage(workerName);
                                        if (workerPercent <= 0) return;
                                        const workerEarning = parseFloat(workerData.cost);
                                        if (!Number.isFinite(workerEarning) || workerEarning <= 0) return;
                                        percentageDeductions += (workerEarning * workerPercent / 100);
                                    }
                                });
                            }
                            
                            // Если текущий работник - бригадир, начисляем равную долю общего пула
                            if (isForeman(workerName)) {
                                if (foremenCount > 0 && totalForemanPool > 0) {
                                    percentageEarnings = totalForemanPool / foremenCount;
                                }
                            }
                            
                            const totalEarnings = totalPaidIncome + totalPendingWithIssued + totalDebtsOwedToWorker + totalExpenses - percentageDeductions + percentageEarnings;

                            const formatEarnings = (amount) => amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace('.00', '');

                            let earningsHtml = '';
                            if (totalPaidIncome !== 0) {
                                const paidIncomeHtml = paidIncome.length > 0
                                ? paidIncome.map(e => `<span class="earnings-item ${e.className}" data-timestamp="${e.timestamp}">+${e.value}</span>`).join(' ')
                                : '0 ₽';
                                earningsHtml += `<div class="earnings paid-earnings"><strong>Заработано:</strong> ${paidIncomeHtml} = ${formatEarnings(totalPaidIncome)} ₽</div>`;
                            }
                            if (totalPendingIncome !== 0 || totalIssuedMoney !== 0) {
                                const pendingIncomeHtml = pendingIncome.length > 0
                                ? pendingIncome.map(e => `<span class="earnings-item ${e.className}" data-timestamp="${e.timestamp}">+${e.value}</span>`).join(' ')
                                : '0 ₽';
                                const issuedMoneyHtml = issuedMoneyBreakdown.length > 0
                                ? issuedMoneyBreakdown.map(e => `<span class="earnings-item ${e.className}" data-timestamp="${e.timestamp}">${e.value}</span>`).join(' ')
                                : '';
                                earningsHtml += `<div class="earnings pending-earnings"><strong>В ожидании:</strong> ${pendingIncomeHtml}${issuedMoneyHtml ? ` ${issuedMoneyHtml}` : ''} = ${formatEarnings(totalPendingWithIssued)} ₽</div>`;
                            }

                            let debtHtml = '';
                            const positiveDebts = [];
                            const negativeDebts = [];

                            Object.entries(debtBalances).forEach(([person, balance]) => {
                                const debtItems = allDebts[person].map(debt => {
                                    const sign = debt.value > 0 ? '+' : '';
                                    return `<span class="earnings-item ${debt.className}" data-timestamp="${debt.timestamp}">${sign}${debt.value.toFixed(2)}</span>`;
                                }).join(' ');

                                const totalBalance = parseFloat(balance);
                                const formattedTotal = totalBalance >= 0 ? `+${formatEarnings(totalBalance)}` : formatEarnings(totalBalance);

                                if (totalBalance > 0) {
                                    positiveDebts.push(`<div class="positive-debt">${person}: ${debtItems} = ${formattedTotal} ₽</div>`);
                                } else if (totalBalance < 0) {
                                    negativeDebts.push(`<div class="negative-debt">${person}: ${debtItems} = ${formattedTotal} ₽</div>`);
                                }
                            });

                            if (positiveDebts.length > 0) {
                                debtHtml += '<div class="earnings receiver-earnings"><strong>Долги мне:</strong>';
                                debtHtml += positiveDebts.join('');
                                debtHtml += '</div>';
                            }

                            if (negativeDebts.length > 0) {
                                debtHtml += '<div class="earnings expense-earnings"><strong>Долги другим:</strong>';
                                debtHtml += negativeDebts.join('');
                                debtHtml += '</div>';
                            }

                            // Новый блок: Расчёт в ожидании с долгами
                            let pendingWithDebtsHtml = '';
                            if (Object.keys(debtBalances).length > 0) {
                                const pendingWithDebtsItems = [];
                                const pendingClassName = totalPendingWithIssued >= 0 ? 'pending-earning' : 'issued-money-negative';
                                let pendingTimestamp = '';
                                if (issuedMoneyBreakdown.length > 0) {
                                    pendingTimestamp = issuedMoneyBreakdown[0].timestamp;
                                } else if (pendingIncome.length > 0) {
                                    pendingTimestamp = pendingIncome[0].timestamp;
                                }
                                pendingWithDebtsItems.push(`<span class="earnings-item issued-money-negative">${formatEarnings(totalPendingWithIssued)}</span>`);

                                Object.entries(debtBalances).forEach(([person, balance]) => {
                                    const totalBalance = parseFloat(balance);
                                    const formattedBalance = totalBalance >= 0 ? `+${formatEarnings(totalBalance)}` : formatEarnings(totalBalance);
                                    const className = totalBalance >= 0 ? 'receiver-earning' : 'expense-earning';
                                    const timestamp = allDebts[person] && allDebts[person].length > 0 ? allDebts[person][0].timestamp : '';
                                    pendingWithDebtsItems.push(`<span class="earnings-item ${className}" ${timestamp ? `data-timestamp="${timestamp}"` : ''}>${formattedBalance}</span>`);
                                });

                                const pendingWithDebtsTotal = totalPendingWithIssued + Object.values(debtBalances)
                                .reduce((sum, balance) => sum + parseFloat(balance), 0);

                                pendingWithDebtsHtml = `<div class="earnings pending-with-debts"><strong>Расчёт в ожидании с долгами:</strong> ${pendingWithDebtsItems.join(' ')} = ${formatEarnings(pendingWithDebtsTotal)} ₽</div>`;
                            }

                            // Новый блок: В ожидании с процентами
                            let pendingWithPercentagesHtml = '';
                            if (percentageDeductions > 0 || percentageEarnings > 0) {
                                const baseAmount = totalPendingWithIssued + Object.values(debtBalances).reduce((sum, balance) => sum + parseFloat(balance), 0);
                                const totalWithPercentages = baseAmount - percentageDeductions + percentageEarnings;
                                
                                const percentageItems = [];
                                
                                // Показываем базовую сумму только если она не ноль
                                if (baseAmount !== 0) {
                                    percentageItems.push(`<span class="earnings-item issued-money-negative">${formatEarnings(baseAmount)}</span>`);
                                }
                                
                                if (percentageDeductions > 0) {
                                    percentageItems.push(`<span class="earnings-item expense-earning">-${formatEarnings(percentageDeductions)}</span>`);
                                }
                                if (percentageEarnings > 0) {
                                    percentageItems.push(`<span class="earnings-item receiver-earning">+${formatEarnings(percentageEarnings)}</span>`);
                                }
                                
                                pendingWithPercentagesHtml = `<div class="earnings pending-with-percentages"><strong>В ожидании с процентами:</strong> ${percentageItems.join(' ')} = ${formatEarnings(totalWithPercentages)} ₽</div>`;
                            }

                            earningsHtml += debtHtml + pendingWithDebtsHtml + pendingWithPercentagesHtml;

                            const card = document.createElement('div');
                            card.className = 'worker-card';
                            
                            // Определяем статус для цветовой индикации
                            const unpaidAmount = totalEarnings - totalPaidIncome - totalExpenses;
                            let statusClass = 'status-paid'; // По умолчанию зеленый
                            
                            if (unpaidAmount > 10000) {
                                statusClass = 'status-debt'; // Красный - большой долг
                            } else if (totalPendingWithIssued > 0 || unpaidAmount > 0) {
                                statusClass = 'status-pending'; // Желтый - есть ожидающие
                            }
                            
                            card.classList.add(statusClass);
                            
                            card.innerHTML = `
                            <div class="worker-name">${getWorkerIcon(workerName)}${workerName}</div>
                            ${earningsHtml}
                            <div class="earnings total-earnings"><strong>Итого:</strong> ${formatEarnings(totalEarnings)} ₽</div>
                            <ul class="stats-list">
                            <li data-filter="regular">Обычные объекты: <span>${regularObjects}</span></li>
                            <li data-filter="manual">Ручная цена: <span>${manualObjects}</span></li>
                            <li data-filter="services">Услуги: <span>${services}</span></li>
                            <li data-filter="expenses">Расходы: <span>${expenses}</span></li>
                            </ul>
                            <div class="worker-chart" data-earnings="${totalEarnings}" data-worker="${workerName}"></div>
                            `;

                            card.addEventListener('click', (e) => {
                                const isChart = e.target.closest('.worker-chart');
                                const isEarningItem = e.target.classList.contains('earnings-item');
                                const isStatsLi = e.target.closest('.stats-list li');
                                if (!isChart && !isEarningItem && !isStatsLi) filterByWorker(workerName);
                            });

                                card.querySelectorAll('.stats-list li').forEach(li => {
                                    li.style.cursor = 'pointer';
                                    li.addEventListener('click', (e) => {
                                        e.stopPropagation();
                                        const filterType = li.dataset.filter;
                                        let filterValue = `${workerName} `;
                                        switch (filterType) {
                                            case 'regular': filterValue += 'обычных объектов'; break;
                                            case 'manual': filterValue += 'объектов с ручной ценой'; break;
                                            case 'services': filterValue += 'услуги'; break;
                                            case 'expenses': filterValue += 'расходов'; break;
                                        }
                                        filterInput.value = filterValue;
                                        renderObjects();
                                        setTimeout(() => {
                                            const filteredCards = resultsDiv.querySelectorAll('.calculation');
                                            if (filteredCards.length > 0) {
                                                filteredCards.forEach(card => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
                                            }
                                            const filterGroup = document.querySelector('.filter-group');
                                            if (!filterGroup.querySelector('.filter-reset')) {
                                                const resetFilter = document.createElement('span');
                                                resetFilter.className = 'filter-reset';
                                                resetFilter.innerHTML = '✕';
                                                resetFilter.title = 'Сбросить фильтр';
                                                resetFilter.addEventListener('click', () => {
                                                    filterInput.value = '';
                                                    renderObjects();
                                                    resetFilter.remove();
                                                });
                                                filterGroup.appendChild(resetFilter);
                                            }
                                        }, 100);
                                    });
                                });

                                card.querySelectorAll('.earnings-item').forEach(item => {
                                    item.addEventListener('click', (e) => {
                                        e.stopPropagation();
                                        const timestamp = item.dataset.timestamp;
                                        scrollToObject(timestamp);
                                    });
                                });

                                statsGrid.appendChild(card);
                        });

                        renderWorkerCharts();
                        
                        // Обновляем алерты и топ-статистику
                        renderAlerts();
                        renderTopStats();
                        
                        // Обновляем графики
                        renderEarningsCharts();
                        
                        // Обновляем прогноз
                        renderForecast();
                    }
                    
                    // Делаем функцию доступной глобально для вкладки "Анализ работы"
                    window.renderWorkerStats = renderWorkerStats;
                    
                    // === АЛЕРТЫ И УВЕДОМЛЕНИЯ ===
                    function renderAlerts() {
                        const alertsContainer = document.getElementById('alerts-container');
                        if (!alertsContainer) return;
                        
                        alertsContainer.innerHTML = '';
                        const alerts = [];
                        
                        // Проверяем большие долги
                        workers.forEach(worker => {
                            const workerName = getWorkerName(worker);
                            const workerObjects = window.objects.filter(obj => 
                                !obj.isExpense && 
                                obj.workers.some(w => (typeof w === 'string' ? w : w.name) === workerName)
                            );
                            
                            const totalPending = workerObjects
                                .filter(obj => !obj.isPaid)
                                .reduce((sum, obj) => {
                                    const workerData = obj.workers.find(w => (typeof w === 'string' ? w : w.name) === workerName);
                                    return sum + (workerData ? parseFloat(workerData.cost || 0) : 0);
                                }, 0);
                            
                            if (totalPending > 150000) {
                                alerts.push({
                                    type: 'danger',
                                    icon: '🚨',
                                    title: 'Большой долг',
                                    message: `${workerName}: ${totalPending.toFixed(2)} ₽ не выплачено`
                                });
                            }
                        });
                        
                        // Проверяем низкий КТУ
                        const lowKtuObjects = window.objects.filter(obj => 
                            !obj.isExpense && 
                            !obj.isPaid &&
                            obj.workers.some(w => w.ktu && w.ktu < 0.8)
                        );
                        
                        if (lowKtuObjects.length > 0) {
                            const affectedWorkers = new Set();
                            lowKtuObjects.forEach(obj => {
                                obj.workers.forEach(w => {
                                    if (w.ktu && w.ktu < 0.8) {
                                        affectedWorkers.add(w.name);
                                    }
                                });
                            });
                            
                            alerts.push({
                                type: 'warning',
                                icon: '⚠️',
                                title: 'Низкий КТУ',
                                message: `${lowKtuObjects.length} объектов с КТУ < 0.8 (${Array.from(affectedWorkers).join(', ')})`
                            });
                        }
                        
                        // Проверяем старые неоплаченные объекты
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        
                        const oldUnpaid = window.objects.filter(obj => 
                            !obj.isExpense && 
                            !obj.isPaid && 
                            new Date(obj.timestamp) < weekAgo
                        );
                        
                        if (oldUnpaid.length > 0) {
                            alerts.push({
                                type: 'info',
                                icon: '📅',
                                title: 'Старые объекты',
                                message: `${oldUnpaid.length} объектов не оплачено больше недели`
                            });
                        }
                        
                        // Отображаем алерты
                        alerts.forEach(alert => {
                            const alertEl = document.createElement('div');
                            alertEl.className = `alert alert-${alert.type}`;
                            alertEl.innerHTML = `
                                <div class="alert-icon">${alert.icon}</div>
                                <div class="alert-content">
                                    <div class="alert-title">${alert.title}</div>
                                    <div class="alert-message">${alert.message}</div>
                                </div>
                            `;
                            alertsContainer.appendChild(alertEl);
                        });
                    }
                    
                    // === ТОП-СТАТИСТИКА ===
                    function renderTopStats() {
                        // Топ работник по заработку
                        const workerEarnings = {};
                        workers.forEach(worker => {
                            const workerName = getWorkerName(worker);
                            const workerObjects = window.objects.filter(obj => 
                                !obj.isExpense && 
                                obj.workers.some(w => (typeof w === 'string' ? w : w.name) === workerName)
                            );
                            
                            workerEarnings[workerName] = workerObjects.reduce((sum, obj) => {
                                const workerData = obj.workers.find(w => (typeof w === 'string' ? w : w.name) === workerName);
                                return sum + (workerData ? parseFloat(workerData.cost || 0) : 0);
                            }, 0);
                        });
                        
                        const topWorkerName = Object.keys(workerEarnings).reduce((a, b) => 
                            workerEarnings[a] > workerEarnings[b] ? a : b, ''
                        );
                        
                        if (topWorkerName) {
                            document.getElementById('top-worker').textContent = topWorkerName;
                            document.getElementById('top-worker-detail').textContent = 
                                `${workerEarnings[topWorkerName].toFixed(2)} ₽`;
                        }
                        
                        // Самый прибыльный объект
                        const topObject = window.objects
                            .filter(obj => !obj.isExpense)
                            .reduce((max, obj) => {
                                const objCost = Math.abs(parseFloat(obj.cost));
                                const maxCost = max ? Math.abs(parseFloat(max.cost)) : 0;
                                return objCost > maxCost ? obj : max;
                            }, null);
                        
                        if (topObject) {
                            document.getElementById('top-object').textContent = topObject.name;
                            document.getElementById('top-object-detail').textContent = 
                                `${Math.abs(parseFloat(topObject.cost)).toFixed(2)} ₽`;
                        }
                        
                        // Средний заработок
                        const incomeObjects = window.objects.filter(obj => !obj.isExpense);
                        const totalIncome = incomeObjects.reduce((sum, obj) => sum + Math.abs(parseFloat(obj.cost)), 0);
                        const avgIncome = incomeObjects.length > 0 ? totalIncome / incomeObjects.length : 0;
                        
                        document.getElementById('avg-earnings').textContent = `${avgIncome.toFixed(2)} ₽`;
                        document.getElementById('avg-earnings-detail').textContent = 
                            `На ${incomeObjects.length} объектов`;
                        
                        // Всего объектов
                        const totalObjects = window.objects.length;
                        const paidObjects = window.objects.filter(obj => obj.isPaid).length;
                        
                        document.getElementById('total-objects').textContent = totalObjects;
                        document.getElementById('total-objects-detail').textContent = 
                            `Оплачено: ${paidObjects} (${((paidObjects/totalObjects)*100).toFixed(0)}%)`;
                    }
                    
                    // === ГРАФИКИ ЗАРАБОТКОВ ===
                    let timelineChart = null;
                    let pieChart = null;
                    
                    function renderEarningsCharts() {
                        const timelineCanvas = document.getElementById('earnings-timeline-chart');
                        const pieCanvas = document.getElementById('earnings-pie-chart');
                        
                        if (!timelineCanvas || !pieCanvas) return;
                        
                        // Уничтожаем старые графики
                        if (timelineChart) {
                            timelineChart.destroy();
                        }
                        if (pieChart) {
                            pieChart.destroy();
                        }
                        
                        // === ЛИНЕЙНЫЙ ГРАФИК ПО ДНЯМ ===
                        const earningsByDate = {};
                        
                        window.objects
                            .filter(obj => !obj.isExpense)
                            .forEach(obj => {
                                const date = parseDateSafe(obj.timestamp).toLocaleDateString('ru-RU');
                                if (!earningsByDate[date]) {
                                    earningsByDate[date] = 0;
                                }
                                earningsByDate[date] += Math.abs(parseFloat(obj.cost));
                            });
                        
                        const sortedDates = Object.keys(earningsByDate).sort((a, b) => {
                            const dateA = a.split('.').reverse().join('-');
                            const dateB = b.split('.').reverse().join('-');
                            return new Date(dateA) - new Date(dateB);
                        });
                        
                        const last30Dates = sortedDates.slice(-30);
                        const earningsData = last30Dates.map(date => earningsByDate[date]);
                        
                        const gridColor = 'rgba(255, 255, 255, 0.1)';
                        const textColor = '#F9FAFB';
                        
                        timelineChart = new Chart(timelineCanvas, {
                            type: 'line',
                            data: {
                                labels: last30Dates,
                                datasets: [{
                                    label: 'Заработок',
                                    data: earningsData,
                                    borderColor: 'rgb(52, 152, 219)',
                                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                                    borderWidth: 3,
                                    fill: true,
                                    tension: 0.4,
                                    pointRadius: 4,
                                    pointBackgroundColor: 'rgb(52, 152, 219)',
                                    pointBorderColor: '#fff',
                                    pointBorderWidth: 2,
                                    pointHoverRadius: 6
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: true,
                                plugins: {
                                    legend: {
                                        display: false
                                    },
                                    tooltip: {
                                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                        titleColor: '#fff',
                                        bodyColor: '#fff',
                                        padding: 12,
                                        displayColors: false,
                                        callbacks: {
                                            label: function(context) {
                                                return context.parsed.y.toFixed(2) + ' ₽';
                                            }
                                        }
                                    }
                                },
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        ticks: {
                                            color: textColor,
                                            callback: function(value) {
                                                return value.toLocaleString() + ' ₽';
                                            }
                                        },
                                        grid: {
                                            color: gridColor
                                        }
                                    },
                                    x: {
                                        ticks: {
                                            color: textColor,
                                            maxRotation: 45,
                                            minRotation: 45,
                                            padding: 5
                                        },
                                        grid: {
                                            color: gridColor
                                        }
                                    }
                                }
                            }
                        });
                        
                        // === КРУГОВАЯ ДИАГРАММА РАСПРЕДЕЛЕНИЯ ===
                        const workerEarnings = {};
                        
                        workers.forEach(worker => {
                            const workerName = getWorkerName(worker);
                            workerEarnings[workerName] = 0;
                        });
                        
                        window.objects
                            .filter(obj => !obj.isExpense)
                            .forEach(obj => {
                                obj.workers.forEach(w => {
                                    const workerName = typeof w === 'string' ? w : w.name;
                                    if (workerEarnings[workerName] !== undefined) {
                                        workerEarnings[workerName] += parseFloat(w.cost || 0);
                                    }
                                });
                            });
                        
                        const workerNames = Object.keys(workerEarnings).filter(name => workerEarnings[name] > 0);
                        const workerData = workerNames.map(name => workerEarnings[name]);
                        
                        const colors = [
                            'rgba(52, 152, 219, 0.8)',
                            'rgba(46, 204, 113, 0.8)',
                            'rgba(155, 89, 182, 0.8)',
                            'rgba(230, 126, 34, 0.8)',
                            'rgba(231, 76, 60, 0.8)',
                            'rgba(241, 196, 15, 0.8)',
                            'rgba(26, 188, 156, 0.8)',
                            'rgba(52, 73, 94, 0.8)',
                            'rgba(149, 165, 166, 0.8)'
                        ];
                        
                        pieChart = new Chart(pieCanvas, {
                            type: 'doughnut',
                            data: {
                                labels: workerNames,
                                datasets: [{
                                    data: workerData,
                                    backgroundColor: colors.slice(0, workerNames.length),
                                    borderColor: '#1F2937',
                                    borderWidth: 2
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: true,
                                plugins: {
                                    legend: {
                                        position: 'bottom',
                                        labels: {
                                            color: textColor,
                                            padding: 15,
                                            font: {
                                                size: 12
                                            }
                                        }
                                    },
                                    tooltip: {
                                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                        titleColor: '#fff',
                                        bodyColor: '#fff',
                                        padding: 12,
                                        callbacks: {
                                            label: function(context) {
                                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                                return `${context.label}: ${context.parsed.toFixed(2)} ₽ (${percentage}%)`;
                                            }
                                        }
                                    }
                                }
                            }
                        });
                    }

                    function scrollToObject(timestamp, scrollPosition = null) {
                        console.log(`Scrolling to timestamp: ${timestamp}`);

                        if (scrollPosition === null) {
                            scrollPosition = window.scrollY || document.documentElement.scrollTop;
                        }

                        const targetCard = document.querySelector(`.calculation[data-timestamp="${timestamp}"]`);
                        if (targetCard) {
                            console.log('Card found, adding highlight');
                            targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            targetCard.classList.add('highlight');

                            addBackButton(scrollPosition);

                            setTimeout(() => {
                                console.log('Removing highlight');
                                targetCard.classList.remove('highlight');
                            }, 3000);
                        } else {
                            console.warn(`Card with timestamp "${timestamp}" not found.`);
                        }
                    }

                    function addBackButton(scrollPosition) {
                        const existingBackBtn = document.getElementById('back-to-stats-btn');
                        if (existingBackBtn) existingBackBtn.remove();

                        const backBtn = document.createElement('button');
                        backBtn.id = 'back-to-stats-btn';
                        backBtn.className = 'back-to-stats-btn floating-btn';
                        backBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 9L12 15L18 9" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

                        backBtn.style.position = 'fixed';
                        backBtn.style.bottom = '70px'; // Над троеточием (20px + 40px кнопка + 10px отступ)
                        backBtn.style.right = '22px'; // Совпадает с floating-btn-container
                        backBtn.style.zIndex = '1002'; // Выше floatingMenuBtn (z-index: 1001)
                        backBtn.style.width = '36px'; // Чуть меньше, чем 40px
                        backBtn.style.height = '36px';
                        backBtn.style.backgroundColor = '#34495e'; // Как у троеточия
                        backBtn.style.border = 'none';
                        backBtn.style.borderRadius = '50%';
                        backBtn.style.cursor = 'pointer';
                        backBtn.style.boxShadow = '0 3px 10px rgba(0,0,0,0.3)';
                        backBtn.style.display = 'flex';
                        backBtn.style.alignItems = 'center';
                        backBtn.style.justifyContent = 'center';
                        backBtn.style.transition = 'all 0.3s ease';

                        backBtn.onmouseover = function() {
                            this.style.backgroundColor = '#2c3e50';
                            this.style.transform = 'translateY(-3px)';
                            this.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
                        };

                        backBtn.onmouseout = function() {
                            this.style.backgroundColor = '#34495e';
                            this.style.transform = 'translateY(0)';
                            this.style.boxShadow = '0 3px 10px rgba(0,0,0,0.3)';
                        };

                        backBtn.addEventListener('click', () => {
                            console.log(`Back button clicked, returning to scrollPosition: ${scrollPosition}`);
                            if (typeof scrollPosition === 'number') {
                                window.scrollTo({
                                    top: scrollPosition,
                                    behavior: 'smooth'
                                });
                            } else {
                                document.getElementById('worker-stats').scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                            backBtn.remove();
                        });

                        // Scroll listener to remove button when close to original scroll position
                        const checkScrollPosition = debounce(() => {
                            const currentScroll = window.scrollY || document.documentElement.scrollTop;
                            const isNearScrollPosition = typeof scrollPosition === 'number' && Math.abs(currentScroll - scrollPosition) < 300;

                            if (isNearScrollPosition) {
                                console.log('Near original scroll position, removing back button', { currentScroll, scrollPosition });
                                backBtn.remove();
                                window.removeEventListener('scroll', checkScrollPosition);
                            }
                        }, 100);

                        window.addEventListener('scroll', checkScrollPosition);

                        document.body.appendChild(backBtn);
                    }

                    // Debounce function to limit scroll event frequency
                    function debounce(func, wait) {
                        let timeout;
                        return function executedFunction(...args) {
                            const later = () => {
                                clearTimeout(timeout);
                                func(...args);
                            };
                            clearTimeout(timeout);
                            timeout = setTimeout(later, wait);
                        };
                    }


                    function filterByWorker(worker) {
                        filterInput.value = worker;
                        renderObjects();
                        const resetFilter = document.createElement('span');
                        resetFilter.className = 'filter-reset';
                        resetFilter.innerHTML = '✕';
                        resetFilter.title = 'Сбросить фильтр';
                        resetFilter.addEventListener('click', () => {
                            filterInput.value = '';
                            renderObjects();
                            resetFilter.remove();
                        });
                        const filterGroup = document.querySelector('.filter-group');
                        if (!filterGroup.querySelector('.filter-reset')) filterGroup.appendChild(resetFilter);
                    }

                    function renderWorkerCharts() {
                        document.querySelectorAll('.worker-chart').forEach(chartDiv => {
                            const worker = chartDiv.dataset.worker;
                            const earnings = parseFloat(chartDiv.dataset.earnings);

                            const workerObjects = window.objects.filter(obj =>
                            (obj.workers.some(w => (typeof w === 'string' ? w : w.name) === worker)) ||
                            (obj.receivers && obj.receivers.includes(worker))
                            );
                            const regularObjects = workerObjects.filter(obj => !obj.isExpense && !obj.manualPrice && !obj.isCustomService).length;
                            const manualObjects = workerObjects.filter(obj => obj.manualPrice).length;
                            const services = workerObjects.filter(obj => obj.isCustomService).length;
                            const expenses = workerObjects.filter(obj => obj.isExpense).length;
                            const lowKtuCount = workerObjects
                            .filter(obj => !obj.isExpense && obj.workers.some(w => w.name === worker && w.ktu < 1))
                            .length;

                            // Если все данные нулевые, добавляем минимальные значения для демонстрации
                            const chartData = [regularObjects, manualObjects, services, expenses, lowKtuCount];
                            const hasData = chartData.some(val => val > 0);
                            
                            // Находим максимальное значение для нормализации - используем реальный максимум или минимум 3 для красоты
                            const actualMax = Math.max(regularObjects, manualObjects, services, expenses, lowKtuCount);
                            const maxValue = actualMax > 0 ? Math.max(actualMax, 3) : 3;

                            const canvas = document.createElement('canvas');
                            chartDiv.innerHTML = '';
                            chartDiv.appendChild(canvas);

                            // Ждем, пока canvas будет готов
                            setTimeout(() => {
                                const chart = new Chart(canvas, {
                                    type: 'radar',
                                    data: {
                                        labels: ['Обычные', 'Ручная', 'Услуги', 'Расходы', 'КТУ < 1'],
                                        datasets: [{
                                            label: worker,
                                            data: chartData,
                                            fill: true,
                                            backgroundColor: 'rgba(255, 99, 132, 0.4)',
                                            borderColor: 'rgb(255, 99, 132)',
                                            borderWidth: 4,
                                            pointBackgroundColor: 'rgb(255, 99, 132)',
                                            pointBorderColor: '#fff',
                                            pointHoverBackgroundColor: '#fff',
                                            pointHoverBorderColor: 'rgb(255, 99, 132)',
                                            pointRadius: 6,
                                            pointHoverRadius: 8,
                                            pointBorderWidth: 3,
                                            pointHoverBorderWidth: 3
                                        }]
                                    },
                                    options: {
                                        responsive: true,
                                        maintainAspectRatio: true,
                                    plugins: {
                                        legend: {
                                            display: false
                                        },
                                        tooltip: {
                                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                            titleColor: '#fff',
                                            bodyColor: '#fff',
                                            borderColor: 'rgba(52, 152, 219, 0.5)',
                                            borderWidth: 1,
                                            padding: 12,
                                            displayColors: false,
                                            callbacks: {
                                                title: function(context) {
                                                    return context[0].label;
                                                },
                                                label: function(context) {
                                                    return 'Участие: ' + context.parsed.r;
                                                }
                                            }
                                        }
                                    },
                                    scales: {
                                        r: {
                                            beginAtZero: true,
                                            max: maxValue,
                                            min: 0,
                                            ticks: {
                                                stepSize: Math.ceil(maxValue / 3),
                                                count: 3,
                                                color: '#95a5a6',
                                                backdropColor: 'transparent',
                                                font: {
                                                    size: 12,
                                                    weight: '500'
                                                },
                                                showLabelBackdrop: false,
                                                z: 1
                                            },
                                            grid: {
                                                color: 'rgba(149, 165, 166, 0.3)',
                                                circular: false,
                                                lineWidth: 2
                                            },
                                            angleLines: {
                                                color: 'rgba(149, 165, 166, 0.4)',
                                                lineWidth: 2
                                            },
                                            pointLabels: {
                                                color: '#2c3e50',
                                                font: {
                                                    size: 11,
                                                    weight: '700'
                                                },
                                                padding: 3
                                            }
                                        }
                                    }
                                }
                            });
                            }, 0);
                        });
                    }

                    function renderObjectDetails(obj) {
                        const costPerWorker = obj.isExpense
                        ? (parseFloat(obj.cost) / obj.workers.length).toFixed(2)
                        : obj.workers.map(w => {
                            return `<span class="worker-item">${getWorkerIcon(w.name)}${w.name}: ${w.cost} ₽ (КТУ ${w.ktu}${w.area ? `, ${w.area} м²` : ''})</span>`;
                        }).join('');
                        const costPerReceiver = obj.isExpense && obj.receivers.length > 0
                        ? (Math.abs(parseFloat(obj.cost)) / obj.receivers.length).toFixed(2)
                        : '0.00';

                        const workersDisplay = obj.isExpense 
                        ? obj.workers.map(worker => {
                            const workerName = typeof worker === 'string' ? worker : worker.name;
                            return `<span class="worker-item">${getWorkerIcon(workerName)}${workerName}</span>`;
                        }).join('')
                        : obj.workers.map(w => {
                            return `<span class="worker-item">${getWorkerIcon(w.name)}${w.name} (КТУ ${w.ktu}${w.area ? `, ${w.area} м²` : ''})</span>`;
                        }).join('');

                        const receiversDisplay = obj.receivers && obj.receivers.length > 0
                        ? obj.receivers.map(receiver => {
                            return `<span class="worker-item">${getWorkerIcon(receiver)}${receiver}</span>`;
                        }).join('')
                        : '';

                        return `
                        ${obj.area ? `<div class="info-line"><span class="label">Площадь:</span><span class="value">${obj.area}</span></div>` : ''}
                        <div class="info-line"><span class="label">Услуга:</span><span class="value">${obj.service}</span></div>
                        <div class="info-line"><span class="label">Стоимость:</span><span class="value">${obj.cost} ₽</span></div>
                        <div class="info-line"><span class="label">${obj.isExpense ? 'Участники (списание)' : 'Участники'}:</span><span class="value">${workersDisplay}</span></div>
                        ${obj.isExpense && receiversDisplay ? `<div class="info-line"><span class="label">Участники (начисление):</span><span class="value">${receiversDisplay}</span></div>` : ''}
                        <div class="info-line"><span class="label">${obj.isExpense ? 'На одного (списание)' : 'Распределение'}:</span><span class="value">${costPerWorker}</span></div>
                        ${obj.isExpense && obj.receivers && obj.receivers.length > 0 ? `<div class="info-line"><span class="label">На одного (начисление):</span><span class="value">${costPerReceiver} ₽</span></div>` : ''}
                        `;
                    }

                    function toggleDimensionFields(formPrefix) {
                        const lengthInput = document.getElementById(`${formPrefix}-length`);
                        const widthInput = document.getElementById(`${formPrefix}-width`);
                        const areaInput = document.getElementById(`${formPrefix}-area`);

                        function updateArea() {
                            const length = parseFloat(lengthInput.value) || 0;
                            const width = parseFloat(widthInput.value) || 0;
                            if (length > 0 && width > 0) {
                                areaInput.value = (length * width).toFixed(2);
                                areaInput.disabled = true;
                            } else {
                                areaInput.value = '';
                                areaInput.disabled = false;
                            }
                        }

                        areaInput.addEventListener('input', () => {
                            const value = areaInput.value.trim();
                            const numValue = parseFloat(value);
                            if (!isNaN(numValue) && numValue > 0) {
                                lengthInput.disabled = true;
                                widthInput.disabled = true;
                                lengthInput.value = '';
                                widthInput.value = '';
                            } else if (!value || value === '0' || numValue === 0) {
                                lengthInput.disabled = false;
                                widthInput.disabled = false;
                                updateArea();
                            }
                        });

                        lengthInput.addEventListener('input', updateArea);
                        widthInput.addEventListener('input', updateArea);
                    }

                    toggleDimensionFields('object');
                    toggleDimensionFields('manual');

                    function createFloatingButtons() {
                        let floatingAddBtn;
                        let floatingCloudBtn;
                        let floatingEditBtn;
                        let floatingStatsBtn;
                        let floatingRefreshBtn;
                        let floatingExportBtn;
                        let floatingExcelBtn;
                        let floatingRestoreBtn;
                        let subButtons = [];
                        let toggleCloudSub = () => {};

                        function toggleAddSub(open) {
                            const shouldOpen = open !== undefined
                                ? open
                                : subButtons.some(btn => {
                                    const el = document.getElementById(btn.id);
                                    return el && !el.classList.contains('show');
                                });
                            subButtons.forEach(btn => {
                                const el = document.getElementById(btn.id);
                                if (!el) return;
                                if (shouldOpen) el.classList.add('show');
                                else el.classList.remove('show');
                            });
                        }

                        function closeAllFloatingMenus() {
                            [floatingAddBtn, floatingCloudBtn, floatingEditBtn, floatingStatsBtn, floatingRefreshBtn].forEach(btn => {
                                if (btn) btn.classList.remove('show');
                            });
                            toggleAddSub(false);
                            toggleCloudSub(false);
                        }
                        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                            anchor.addEventListener('click', () => {
                                closeAllFloatingMenus();
                            });
                        });
                        // Удаляем существующие плавающие кнопки, если они есть
                        const existingButtons = document.querySelectorAll('.floating-btn-container, .floating-btn, .sub-btn');
                        existingButtons.forEach(btn => btn.remove());

                        // Создаем контейнер для кнопок
                        const buttonContainer = document.createElement('div');
                        buttonContainer.id = 'floating-btn-container';
                        buttonContainer.className = 'floating-btn-container';

                        // Создаем кнопку меню (троеточие)
                        const floatingMenuBtn = document.createElement('button');
                        floatingMenuBtn.id = 'floating-menu-btn';
                        floatingMenuBtn.className = 'floating-btn menu-btn';
                        floatingMenuBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="5" r="2" fill="white"/><circle cx="12" cy="12" r="2" fill="white"/><circle cx="12" cy="19" r="2" fill="white"/></svg>';

                        // Создаем кнопку добавления (плюс)
                        floatingAddBtn = document.createElement('button');
                        floatingAddBtn.id = 'floating-add-btn';
                        floatingAddBtn.className = 'floating-btn fab-btn';
                        floatingAddBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;"><path d="M12 5V19" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" style="stroke:white;fill:none;"/><path d="M5 12H19" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" style="stroke:white;fill:none;"/></svg>';
                        floatingAddBtn.title = "Добавить объект";

                        // Создаем контейнер для подкнопок внутри кнопки добавления
                        const subButtonsContainer = document.createElement('div');
                        subButtonsContainer.id = 'sub-buttons-container';
                        subButtonsContainer.className = 'sub-buttons-container';

                        subButtons = [
                            { id: 'sub-point', color: '#4A90E2', formId: 'add-point-form', title: 'Добавить объект' },
                            { id: 'add-line', color: '#E94B8B', formId: 'add-line-form', title: 'Добавить расход' },
                            { id: 'add-polygon', color: '#F7971E', formId: 'add-polygon-form', title: 'Добавить объект с ручной ценой' },
                            { id: 'add-collection', color: '#667eea', formId: 'add-collection-form', title: 'Добавить услугу' }
                        ];

                        subButtons.forEach(btn => {
                            const subBtn = document.createElement('button');
                            subBtn.id = btn.id;
                            subBtn.className = 'floating-btn sub-btn';
                            subBtn.style.backgroundColor = btn.color; // Используем цвета из массива, уже обновленные
                            subBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 5V19" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M5 12H19" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
                            subBtn.title = btn.title;
                            subBtn.addEventListener('click', () => {
                                let targetForm = null;

                                if (btn.formId === 'add-point-form') {
                                    targetForm = objectForm;
                                    showForm(objectForm);
                                } else if (btn.formId === 'add-line-form') {
                                    targetForm = expenseForm;
                                    showForm(expenseForm);
                                } else if (btn.formId === 'add-polygon-form') {
                                    targetForm = manualPriceForm;
                                    showForm(manualPriceForm);
                                } else if (btn.formId === 'add-collection-form') {
                                    targetForm = customServiceForm;
                                    showForm(customServiceForm);
                                }

                                if (targetForm) {
                                    console.log(`Scrolling to form: ${btn.formId}`);
                                    const y = targetForm.getBoundingClientRect().top + window.scrollY;
                                    window.scrollTo({ top: y - 15, behavior: 'smooth' });
                                } else {
                                    console.warn(`Form for ${btn.formId} not found or targetForm is null`);
                                }

                                closeAllFloatingMenus();
                            });

                            subButtonsContainer.appendChild(subBtn);
                        });

                        // Группа «облако»: подменю для сохранения/загрузки/экселя
                        const cloudWrapper = document.createElement('div');
                        cloudWrapper.className = 'cloud-wrapper';

                        floatingCloudBtn = document.createElement('button');
                        floatingCloudBtn.id = 'floating-cloud-btn';
                        floatingCloudBtn.className = 'floating-btn fab-btn';
                        floatingCloudBtn.title = 'Данные';
                        floatingCloudBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;"><path d="M7 18H18.5C20.433 18 22 16.433 22 14.5C22 12.786 20.87 11.345 19.29 10.94C18.86 8.19 16.5 6 13.64 6C11.62 6 9.86 7.06 8.94 8.64C7.83 8.23 6.59 8.37 5.62 9.04C4.54 9.78 3.88 11.02 3.88 12.36C3.88 15 5.98 17 8.62 17H7" stroke="white" stroke-width="2" fill="none"/></svg>';

                        // Создаем кнопку экспорта (JSON)
                        floatingExportBtn = document.createElement('button');
                        floatingExportBtn.id = 'floating-export-btn';
                        floatingExportBtn.className = 'floating-btn sub-btn cloud-sub';
                        floatingExportBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;"><path d="M12 3V15" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M8 11L12 15L16 11" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="4" y="17" width="16" height="4" rx="1" stroke="white" stroke-width="2" fill="none"/></svg>';
                        floatingExportBtn.title = "Экспорт в JSON";

                        // Кнопка экспорта в Excel (CSV)
                        floatingExcelBtn = document.createElement('button');
                        floatingExcelBtn.id = 'floating-excel-btn';
                        floatingExcelBtn.className = 'floating-btn sub-btn cloud-sub';
                        floatingExcelBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;"><rect x="3" y="4" width="18" height="16" rx="2" stroke="white" stroke-width="2" fill="none"/><path d="M3 9H21M8 4V20M14 4V20" stroke="white" stroke-width="2"/></svg>';
                        floatingExcelBtn.title = "Экспорт в Excel";

                        // Кнопка восстановления из JSON
                        floatingRestoreBtn = document.createElement('button');
                        floatingRestoreBtn.id = 'floating-restore-btn';
                        floatingRestoreBtn.className = 'floating-btn sub-btn cloud-sub';
                        floatingRestoreBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;"><rect x="4" y="17" width="16" height="4" rx="1" stroke="white" stroke-width="2" fill="none"/><path d="M12 21V9" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M16 13L12 9L8 13" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                        floatingRestoreBtn.title = "Восстановить из JSON";

                        // Состояние подменю
                        // Контейнер подменю облака (аналогично плюс-меню)
                        const cloudSubContainer = document.createElement('div');
                        cloudSubContainer.id = 'cloud-sub-buttons-container';
                        cloudSubContainer.className = 'cloud-sub-buttons';
                        // вложим подменю внутрь обертки облака, чтобы позиционировалось над кнопкой
                        cloudWrapper.appendChild(cloudSubContainer);

                        // Добавляем подкнопки в контейнер облака
                        [floatingExportBtn, floatingExcelBtn, floatingRestoreBtn].forEach(btn => {
                            cloudSubContainer.appendChild(btn);
                        });

                        const cloudSubButtons = [floatingExportBtn, floatingExcelBtn, floatingRestoreBtn];
                        toggleCloudSub = (open) => {
                            const shouldOpen = open !== undefined ? open : cloudSubButtons.some(b => !b.classList.contains('show'));
                            // Принудительно якорим контейнер по центру над облаком
                            cloudSubContainer.style.position = 'absolute';
                            cloudSubContainer.style.left = '50%';
                            cloudSubContainer.style.right = 'auto';
                            cloudSubContainer.style.bottom = '50px';
                            cloudSubContainer.style.transform = 'translateX(-50%)';
                            cloudSubButtons.forEach(b => {
                                if (shouldOpen) b.classList.add('show'); else b.classList.remove('show');
                            });
                        };
                        floatingCloudBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            toggleAddSub(false);
                            toggleCloudSub();
                        });
                        // Изначально скрыты
                        toggleCloudSub(false);

                        // Создаем кнопку редактирования (карандаш)
                        floatingEditBtn = document.createElement('button');
                        floatingEditBtn.id = 'floating-edit-btn';
                        floatingEditBtn.className = 'floating-btn fab-btn';
                        floatingEditBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;"><path d="M11 4H4C2.89543 4 2 4.89543 2 6V20C2 21.1046 2.89543 22 4 22H18C19.1046 22 20 21.1046 20 20V13" style="stroke:white;fill:none;" stroke="white" stroke-width="2"/><path d="M18.5 2.5C19.3284 1.67157 20.6716 1.67157 21.5 2.5C22.3284 3.32843 22.3284 4.67157 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" style="stroke:white;fill:none;" stroke="white" stroke-width="2"/></svg>';
                        floatingEditBtn.title = "Режим редактирования";

                        // Создаем кнопку статистики работников (человечек)
                        floatingStatsBtn = document.createElement('button');
                        floatingStatsBtn.id = 'floating-stats-btn';
                        floatingStatsBtn.className = 'floating-btn fab-btn';
                        floatingStatsBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;"><circle cx="12" cy="6" r="4" style="stroke:white;fill:none;" stroke="white" stroke-width="2"/><path d="M4 20C4 16.6863 6.68629 14 10 14H14C17.3137 14 20 16.6863 20 20" style="stroke:white;fill:none;" stroke="white" stroke-width="2"/></svg>';
                        floatingStatsBtn.title = "Статистика работников";

                        // Создаем кнопку обновления страницы (стрелки вращения)
                        floatingRefreshBtn = document.createElement('button');
                        floatingRefreshBtn.id = 'floating-refresh-btn';
                        floatingRefreshBtn.className = 'floating-btn fab-btn';
                        floatingRefreshBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;"><path d="M3.07 10.88C3.62 6.44 7.41 3 12 3C14.28 3 16.4 3.85 18.01 5.25V4C18.01 3.45 18.46 3 19.01 3C19.56 3 20.01 3.45 20.01 4V8C20.01 8.55 19.56 9 19.01 9H15C14.45 9 14 8.55 14 8C14 7.45 14.45 7 15 7H16.96C15.68 5.76 13.91 5 12 5C8.43 5 5.48 7.67 5.05 11.12C4.99 11.67 4.49 12.06 3.94 11.99C3.39 11.92 3 11.42 3.07 10.88ZM20.06 12.01C20.61 12.08 21 12.58 20.93 13.12C20.38 17.56 16.59 21 12 21C9.72 21 7.61 20.15 6 18.76V20C6 20.55 5.55 21 5 21C4.45 21 4 20.55 4 20V16C4 15.45 4.45 15 5 15H9C9.55 15 10 15.45 10 16C10 16.55 9.55 17 9 17H7.04C8.32 18.24 10.09 19 12 19C15.57 19 18.52 16.33 18.95 12.88C19.01 12.33 19.51 11.94 20.06 12.01Z" fill="white" style="fill:white;"/></svg>';
                        floatingRefreshBtn.title = "Обновить страницу";

                        // Добавляем стили через CSS
                        const style = document.createElement('style');
                        style.textContent = `
                        .floating-btn-container {
                            position: fixed;
                            bottom: 20px;
                            right: 20px;
                            z-index: 1000;
                            display: flex;
                            flex-direction: row-reverse;
                            align-items: center;
                            gap: 10px;
                        }

                        .sub-buttons-container {
                            position: absolute;
                            bottom: 50px;
                            left: 50%;
                            transform: translateX(-50%);
                            display: flex;
                            flex-direction: column-reverse;
                            align-items: center;
                            gap: 10px;
                            z-index: 999;
                        }

                        #cloud-sub-buttons-container {
                            position: absolute;
                            bottom: 50px;
                            right: 0;
                            left: auto;
                            transform: none;
                            display: flex;
                            flex-direction: column-reverse;
                            align-items: center;
                            gap: 10px;
                            z-index: 999;
                        }

                        .floating-btn {
                            width: 40px;
                            height: 40px;
                            border-radius: 50%;
                            border: none;
                            cursor: pointer;
                            box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                            transition: all 0.3s ease;
                            position: relative;
                            padding: 10px;
                        }
                        
                        .floating-btn svg {
                            pointer-events: none;
                            display: block;
                            width: 100%;
                            height: 100%;
                        }

                        .sub-btn {
                            width: 32px;
                            height: 32px;
                            transform: scale(0);
                            opacity: 0;
                            transition: all 0.3s ease;
                        }

                        .sub-btn.show {
                            transform: scale(1);
                            opacity: 1;
                        }

                        .menu-btn {
                            background-color: #34495e;
                            z-index: 1001;
                        }

                        .menu-btn:hover {
                            background-color: #2c3e50;
                            transform: rotate(90deg);
                        }

                        .fab-btn {
                            transform: scale(0);
                            opacity: 0;
                            transition: all 0.3s ease;
                        }

                        .fab-btn.show {
                            transform: scale(1);
                            opacity: 1;
                        }

                        #floating-add-btn {
                        background-color: #27ae60;
                        }

                        #floating-add-btn:hover {
                        background-color: #219653;
                        transform: translateY(-3px);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                        }

                        #floating-export-btn {
                        background-color: #3498db;
                        }

                        #floating-export-btn:hover {
                        background-color: #2980b9;
                        transform: translateY(-3px);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                        }

                        #floating-edit-btn {
                        background-color: #3498db;
                        }

                        #floating-edit-btn:hover {
                        background-color: #2980b9;
                        transform: translateY(-3px);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                        }

                        #floating-edit-btn.active {
                        background-color: #e74c3c;
                        }

                        #floating-edit-btn.active:hover {
                        background-color: #c0392b;
                        }

                        #floating-stats-btn {
                        background-color: #3498db;
                        }

                        #floating-stats-btn:hover {
                        background-color: #2980b9;
                        transform: translateY(-3px);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                        }

                        #floating-refresh-btn {
                        background-color: #3498db;
                        }

                        #floating-refresh-btn:hover {
                        background-color: #2980b9;
                        transform: translateY(-3px);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                        }

                        #floating-excel-btn {
                        background-color: #1abc9c;
                        }

                        #floating-excel-btn:hover {
                        background-color: #16a085;
                        transform: translateY(-3px);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                        }

                        #floating-restore-btn {
                        background-color: #f39c12;
                        }

                        #floating-cloud-btn {
                        background-color: #3498db;
                        }
                        .cloud-wrapper { position: relative; }

                        /* Переопределяем позиционирование подменю облака: строго по центру над облаком */
                        #cloud-sub-buttons-container {
                            bottom: 50px !important;
                            left: 50% !important;
                            right: auto !important;
                            transform: translateX(-50%) !important;
                        }

                        #floating-cloud-btn:hover {
                        background-color: #2980b9;
                        transform: translateY(-3px);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                        }

                        #floating-restore-btn:hover {
                        background-color: #d68910;
                        transform: translateY(-3px);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                        }
                        `;
                        document.head.appendChild(style);

                        // Добавляем обработчики событий
                        floatingMenuBtn.addEventListener('click', () => {
                            const shouldOpen = !floatingAddBtn.classList.contains('show');
                            closeAllFloatingMenus();
                            if (shouldOpen) {
                                floatingAddBtn.classList.add('show');
                                floatingCloudBtn.classList.add('show');
                                floatingEditBtn.classList.add('show');
                                floatingStatsBtn.classList.add('show');
                                floatingRefreshBtn.classList.add('show');
                            }
                        });

                        floatingAddBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            toggleCloudSub(false);
                            toggleAddSub();
                        });

                        floatingExportBtn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            try {
                                const password = prompt('Введите пароль для шифрования бэкапа:');
                                if (!password) {
                                    closeAllFloatingMenus();
                                    return;
                                }
                                const confirmPassword = prompt('Повторите пароль:');
                                if (password !== confirmPassword) {
                                    alert('Пароли не совпадают.');
                                    closeAllFloatingMenus();
                                    return;
                                }

                                const encryptedPayload = await encryptBackupData({
                                    objects: window.objects,
                                    workers
                                }, password);
                                const json = JSON.stringify(encryptedPayload, null, 2);
                                const blob = new Blob([json], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `save_${new Date().toISOString().slice(0, 10)}.enc.json`;
                                a.style.display = 'none';
                                document.body.appendChild(a);
                                a.click();

                                // Оставляем ручной fallback-ссылкой на случай блокировки авто-скачивания браузером
                                const fallbackLink = document.createElement('a');
                                fallbackLink.href = url;
                                fallbackLink.download = a.download;
                                fallbackLink.textContent = 'Нажмите здесь, если файл не скачался автоматически';
                                fallbackLink.style.position = 'fixed';
                                fallbackLink.style.right = '16px';
                                fallbackLink.style.bottom = '80px';
                                fallbackLink.style.zIndex = '2000';
                                fallbackLink.style.padding = '10px 12px';
                                fallbackLink.style.background = '#1f2937';
                                fallbackLink.style.color = '#fff';
                                fallbackLink.style.borderRadius = '8px';
                                fallbackLink.style.textDecoration = 'none';
                                document.body.appendChild(fallbackLink);
                                setTimeout(() => {
                                    fallbackLink.remove();
                                    a.remove();
                                    URL.revokeObjectURL(url);
                                }, 15000);
                            } catch (err) {
                                console.error('Ошибка экспорта зашифрованного бэкапа:', err);
                                if (err && err.message === 'WEB_CRYPTO_UNAVAILABLE') {
                                    alert(
                                        'Шифрование недоступно в этом окружении.\n' +
                                        'Нужен Secure Context: откройте сайт по HTTPS или через localhost/127.0.0.1.\n' +
                                        `Текущий адрес: ${window.location.origin}`
                                    );
                                } else {
                                    alert(`Не удалось создать зашифрованный бэкап: ${err && err.message ? err.message : 'неизвестная ошибка'}`);
                                }
                            } finally {
                                closeAllFloatingMenus();
                            }
                        });

                        floatingExcelBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const csv = generateCSV();
                            downloadFile(csv, `Отчет_${new Date().toLocaleDateString('ru-RU')}.csv`, 'text/csv;charset=utf-8;');

                            closeAllFloatingMenus();
                        });

                        floatingRestoreBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            // Создаем временный input для выбора файла
                            const tempInput = document.createElement('input');
                            tempInput.type = 'file';
                            tempInput.accept = '.json,application/json';
                            tempInput.style.display = 'none';
                            document.body.appendChild(tempInput);
                            tempInput.addEventListener('change', (e) => {
                                const file = e.target.files && e.target.files[0];
                                if (!file) {
                                    document.body.removeChild(tempInput);
                                    return;
                                }
                                const reader = new FileReader();
                                reader.onload = async (event) => {
                                    try {
                                        const raw = JSON.parse(event.target.result);
                                        let normalizedSource = raw;

                                        if (raw && raw.__encryptedBackup) {
                                            const password = prompt('Введите пароль для расшифровки бэкапа:');
                                            if (!password) {
                                                alert('Восстановление отменено: пароль не введен.');
                                                return;
                                            }
                                            try {
                                                normalizedSource = await decryptBackupData(raw, password);
                                            } catch (_decryptError) {
                                                alert('Не удалось расшифровать файл. Проверьте пароль.');
                                                return;
                                            }
                                        }

                                        const { objects: restoredObjects, workers: restoredWorkers } = normalizeBackup(normalizedSource);
                                        if (confirm('Восстановить данные из JSON? Текущие данные будут перезаписаны.')) {
                                            window.objects = Array.isArray(restoredObjects) ? restoredObjects : [];
                                            workers = (Array.isArray(restoredWorkers) ? restoredWorkers : (workers || []))
                                                .map((w) => normalizeWorkerRecord(typeof w === 'object' ? w : { name: w, role: 'worker' }));
                                            saveData();
                                            populateWorkers();
                                            renderObjects();
                                            renderWorkerStats();
                                            alert('Данные успешно восстановлены!');
                                        }
                                    } catch (err) {
                                        alert('Ошибка при восстановлении: ' + err.message);
                                    } finally {
                                        document.body.removeChild(tempInput);
                                    }
                                };
                                reader.readAsText(file);
                            }, { once: true });
                            tempInput.click();
                            closeAllFloatingMenus();
                         });

                        floatingEditBtn.addEventListener('click', () => {
                            // Переключаем режим редактирования напрямую
                            editMode = !editMode;

                            // Обновляем внешний вид кнопки
                            floatingEditBtn.classList.toggle('active', editMode);

                            // Перерисовываем объекты с учетом нового режима
                            renderObjects();

                            closeAllFloatingMenus();
                        });

                        floatingStatsBtn.addEventListener('click', () => {
                            const statsSection = document.getElementById('worker-stats');
                            if (statsSection) {
                                const y = statsSection.getBoundingClientRect().top + window.scrollY;
                                window.scrollTo({ top: y - 15, behavior: 'smooth' });
                            } else {
                                console.warn('Element with id "worker-stats" not found');
                            }

                            closeAllFloatingMenus();
                        });

                        floatingRefreshBtn.addEventListener('click', () => {
                            try {
                                caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
                                loadData();
                            } catch (e) {
                                console.warn('Error in loadData:', e);
                            }
                            location.reload();

                            closeAllFloatingMenus();
                        });

                        if (editMode) {
                            floatingEditBtn.classList.add('active');
                        }

                        // Добавляем подкнопки в кнопку добавления
                        floatingAddBtn.appendChild(subButtonsContainer);

                        // Добавляем кнопки в контейнер
                        buttonContainer.appendChild(floatingMenuBtn);
                        buttonContainer.appendChild(floatingAddBtn);
                        cloudWrapper.appendChild(floatingCloudBtn);
                        buttonContainer.appendChild(cloudWrapper);
                        buttonContainer.appendChild(floatingEditBtn);
                        buttonContainer.appendChild(floatingStatsBtn);
                        buttonContainer.appendChild(floatingRefreshBtn);

                        // Добавляем контейнер на страницу
                        document.body.appendChild(buttonContainer);

                        // Кнопка меню показывается только при открытой calc19
                        const activeTab = document.querySelector('.tab-content.active');
                        const shouldShow = activeTab && activeTab.id === 'calc19';
                        floatingMenuBtn.style.display = shouldShow ? 'block' : 'none';

                        return { buttonContainer, floatingMenuBtn, floatingAddBtn, floatingExportBtn, floatingExcelBtn, floatingRestoreBtn, floatingEditBtn, floatingStatsBtn, floatingRefreshBtn };
                    }

                    // Вызываем createFloatingButtons сразу после объявления
                    // Используем setTimeout чтобы убедиться, что DOM полностью готов
                    setTimeout(() => {
                        createFloatingButtons();
                        // После создания кнопок обновляем видимость кнопки меню
                        const floatingBtn = document.getElementById('floating-menu-btn');
                        if (floatingBtn) {
                            const activeTab = document.querySelector('.tab-content.active');
                            const shouldShow = activeTab && activeTab.id === 'calc19';
                            floatingBtn.style.display = shouldShow ? 'block' : 'none';
                        }
                    }, 100);

                    // Глобальный клик вне меню — скрыть все
                    document.addEventListener('click', (ev) => {
                        const within = ev.target.closest && ev.target.closest('#floating-btn-container');
                        if (!within) {
                            [
                                'floating-add-btn',
                                'floating-cloud-btn',
                                'floating-edit-btn',
                                'floating-stats-btn',
                                'floating-refresh-btn',
                                'floating-export-btn',
                                'floating-excel-btn',
                                'floating-restore-btn',
                                'sub-point',
                                'add-line',
                                'add-polygon',
                                'add-collection'
                            ].forEach(id => {
                                const el = document.getElementById(id);
                                if (el) el.classList.remove('show');
                            });
                        }
                    });

                    // Стартовое состояние — скрыто
                    [
                        'floating-add-btn',
                        'floating-cloud-btn',
                        'floating-edit-btn',
                        'floating-stats-btn',
                        'floating-refresh-btn',
                        'floating-export-btn',
                        'floating-excel-btn',
                        'floating-restore-btn'
                    ].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.classList.remove('show');
                    });
});
