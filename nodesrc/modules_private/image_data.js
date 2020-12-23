const fs = require('fs');
const routes =  require('express').Router();
const sql = require('./sql_calls');
const schema = require('./joi_models');
const { auth } = require('./user_auth');


// Constants
const PATH = '/var/project/src/public/';
const DOODLES = PATH+'assets/doodles/';
const WEB_JSON = PATH+'assets/doodles/web.json';
const TRANSLATION = PATH+'assets/other/translation.json';
const TRANSLATION_ENG = PATH+'assets/other/class_names.txt';
const TRANSLATION_DE = PATH+'assets/other/class_names_german.txt';

fs.readFile(WEB_JSON, 'utf8', (err, data) => {
    if(err === null) return;
    fs.writeFile(WEB_JSON, '', () => {});
});

/* Create Translation File  */
fs.readFile(TRANSLATION, 'utf8', (err, data) => {
    if(err === null) return;
    let de = fs.readFileSync(TRANSLATION_DE, 'utf8').split('\r\n');
    let eng = fs.readFileSync(TRANSLATION_ENG, 'utf8').split('\r\n');

    var translation = {};
    for (let i = 0; i < eng.length; i++) {
        translation[eng[i]] = de[i];  
    }
    fs.writeFileSync(TRANSLATION, JSON.stringify(translation, null, 4));
});



var func = {};

func.WEB = WEB_JSON;

func.TRANSLATION = TRANSLATION;

func.DOODLES = DOODLES;

func.PATH = PATH

func.HTML = (str) => PATH+'html/'+str+'.html';


// Write posted image to shared volume (todo env for shared volume path?)
func.write_img_to_file = (body, callback) => {

    // Get base64 Data
    let base64 = body.img_data.replace(/^data:image\/png;base64,/, "");
    body.img_data = '';

    // Write image to file
    fs.writeFile(DOODLES+body.img_path, base64, 'base64', (err) => {

        callback(err);
        
        // Write to JSON-File
        let file = fs.readFileSync(WEB_JSON, 'utf-8');

        // If file is empty, initialize json as Object
        if(!file || file.length === 0) var json = {};
        else var json = JSON.parse(file);
            
        // Append new Data
        json[body.img_path] = body;        
        fs.writeFileSync(WEB_JSON, JSON.stringify(json, null, 4));
    });
}



// Handling everything todo when new image is post to server
func.handle_new_image = (con, body,res) => {
   
    body.img_path = body.img_name.toLowerCase().replaceAll(' ','-');
    body.img_path += '-'+Math.floor(Math.random() * 2147483647)+'.png';

    sql.insert_img(con, body, (err, result) => {

        if(err) {
            // if entry already exists just retry. It's rare that this will happen
            if(err && err.code == 'ER_DUB_ENTRY') return func.handle_new_image(con, body, res);
            else res.status(400).send('Something went wrong');
        }
        
        sql.insert_into_ml5(con, result.insertId, body.ml5);
        func.write_img_to_file(body, (err, result) => {
            res.status(200).json({ img_path: body.img_path });
        });
    });
}


// Handling everything todo when existiting image on server is to be updated
func.handle_update_img = (con, body, res) => {  
    sql.update_img(con, body, (err, result) => {
                       
        if(err) return res.status(400).send('NOT OK');;
        func.write_img_to_file(body, (err) => {
            res.status(200).send('OK');
        });
    });
}



// POSTS //
routes.post('/images/search', (req,res) => {
    sql.call((con) => {
        sql.get_img(con, req.body, (err, result) => res.json(result));
    });
});

routes.post('/images/data', auth, (req,res) => {

    if(!req.body) return res.status(400).send('Not Body');

    fs.readFile(DOODLES+req.body.img_path, 'base64', (err, data) =>{
        
        if(err) return res.status(404).send('Not Found');
        res.status(200).json({img_data: data});
    })
});

routes.post('/images/save', auth, (req,res) => {
    
    let body = req.body;
    const validated = schema.image.validate(body);
    if(validated.error) return res.status(400).send(validated.error);
    
    if (body.img_path.length === 0)
        sql.call( (con) => func.handle_new_image(con, body, res));
    else
        sql.call( (con) => func.handle_update_img(con, body, res));

});

module.exports = { helper: func, image_routes: routes }